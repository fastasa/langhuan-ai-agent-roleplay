// 统一处理“已加载总结ID”的兼容解析，避免各处重复实现
export function safeParseJSON<T>(str: string | unknown, fallback: T): T {
  try {
    return str ? JSON.parse(str as string) : fallback
  } catch {
    return fallback
  }
}

export function normalizeLoadedSummaryIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item)).filter(Boolean)
  }
  if (typeof value === 'string') {
    const parsed = safeParseJSON<unknown>(value, [])
    return Array.isArray(parsed) ? parsed.map(item => String(item)).filter(Boolean) : []
  }
  return []
}
