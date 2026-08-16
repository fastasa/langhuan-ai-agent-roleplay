export interface VirtualTimeFlowLike {
  virtualTime?: string
  virtual_time?: string
  virtualTimeAnchor?: number
  virtual_time_anchor?: number
  virtualTimeBase?: number
  virtual_time_base?: number
  virtualTimeRate?: number
  virtual_time_rate?: number
}

const DEFAULT_VIRTUAL_TIME_RATE = 1

export function clampVirtualTimeRate(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VIRTUAL_TIME_RATE
  return Math.min(60, Math.max(0, Math.round(value * 10) / 10))
}

/**
 * 帷幕当前时间的唯一数值口径：有锚点时按 base + elapsed * rate 推进；
 * 老数据没有数值基准时才尝试解析 virtualTime 文本。自定义历法无法确定时返回 null。
 */
export function resolveFlowingVirtualTimeMs(
  session?: VirtualTimeFlowLike | null,
  now = Date.now()
): number | null {
  const base = Number(session?.virtualTimeBase ?? session?.virtual_time_base ?? 0)
  if (Number.isFinite(base) && base !== 0) {
    const rawAnchor = Number(session?.virtualTimeAnchor ?? session?.virtual_time_anchor ?? 0)
    const anchor = Number.isFinite(rawAnchor) && rawAnchor > 0 ? rawAnchor : now
    const rate = clampVirtualTimeRate(Number(session?.virtualTimeRate ?? session?.virtual_time_rate ?? DEFAULT_VIRTUAL_TIME_RATE))
    return base + Math.max(0, now - anchor) * rate
  }

  const text = String(session?.virtualTime ?? session?.virtual_time ?? '').trim()
  if (!text) return null
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}
