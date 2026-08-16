/**
 * 父 Agent 派遣子 Agent 时的统一时限协议。
 *
 * `timeoutMinutes` 是父 Agent 可决策的运行预算，不是业务事实；运行器仍保留停止信号与轮数/工具数预算。
 * 统一在这里校验，避免采风、编剧等工具各自发明范围和报错口径。
 */

export const DEFAULT_SUBAGENT_TIMEOUT_MINUTES = 30
export const MIN_SUBAGENT_TIMEOUT_MINUTES = 1
export const MAX_SUBAGENT_TIMEOUT_MINUTES = 360

export const SUBAGENT_TIMEOUT_SCHEMA_PROPERTY = {
  type: 'number',
  minimum: MIN_SUBAGENT_TIMEOUT_MINUTES,
  maximum: MAX_SUBAGENT_TIMEOUT_MINUTES,
  description: `可选：本次子 Agent 的运行时限（分钟，${MIN_SUBAGENT_TIMEOUT_MINUTES}~${MAX_SUBAGENT_TIMEOUT_MINUTES}；缺省 ${DEFAULT_SUBAGENT_TIMEOUT_MINUTES}）。复杂调研可主动给更长时间；超时后应根据原始回执决定延长重试、缩小任务或带缺口继续。`
} as const

export function validateSubagentTimeoutMinutes(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return 'timeoutMinutes 必须是分钟数'
  if (value < MIN_SUBAGENT_TIMEOUT_MINUTES || value > MAX_SUBAGENT_TIMEOUT_MINUTES) {
    return `timeoutMinutes 必须在 ${MIN_SUBAGENT_TIMEOUT_MINUTES}~${MAX_SUBAGENT_TIMEOUT_MINUTES} 分钟之间`
  }
  return null
}

export function resolveSubagentTimeout(raw: unknown, fallbackMinutes = DEFAULT_SUBAGENT_TIMEOUT_MINUTES): {
  timeoutMinutes: number
  timeoutMs: number
  explicitlySet: boolean
} {
  const explicitlySet = raw !== undefined && raw !== null && raw !== ''
  const requested = explicitlySet ? Number(raw) : Number(fallbackMinutes)
  const timeoutMinutes = Math.min(
    MAX_SUBAGENT_TIMEOUT_MINUTES,
    Math.max(MIN_SUBAGENT_TIMEOUT_MINUTES, Number.isFinite(requested) ? requested : DEFAULT_SUBAGENT_TIMEOUT_MINUTES)
  )
  return { timeoutMinutes, timeoutMs: Math.round(timeoutMinutes * 60_000), explicitlySet }
}

export function formatSubagentElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.round(Number(elapsedMs || 0) / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`
}
