/**
 * 通用「轮内可重试单元」注册表 + 自动重试缓冲（真机五验④·2026-07-05·用户拍板）。
 *
 * 由来：本轮统筹成功、但「统筹完毕 → 子工作流」的生成段（旁白正文生成 / 逐角色消息生成）因模型供应商报错失败时，
 * 旧行为=整轮立刻断、失败的子工作流没有任何可重试入口（消息没落库·regenerateFromPrompt 无从锚定），
 * 用户在提调框说「重试」提调也做不到。用户拍板的通用方案：
 *   1) 易失败环节失败时**不立刻断**——先经 {@link runWithAutoRetry} 自动重试（重试前等 5s 缓冲）；
 *   2) 仍失败则把「重跑所需的参数快照」登记进本注册表（轮级·按会话分桶·新轮锚自动清旧轮）；
 *   3) 提调纠偏 loop 挂 retryFailedWorkflow 工具（tidiaoGlobalTools），通过注册表接口真正重跑失败单元。
 * 不只子工作流：以后其他易失败环节（模型调用等）也按同一接口登记进来，重试能力一处复用。
 *
 * 边界：本模块只管「登记什么失败了 + 重跑参数快照 + 自动重试节奏」，**不执行重跑**——
 * 执行器由 pipeline 注入纠偏 loop 的 retrySeam 解释 payload（那里才有 runSingleChat / 旁白生成链路等依赖）。
 * 纯内存、轮级生命周期，绝不进 langhuan.db（守数据红线）。
 */

import type { PersonalityNarrationCall } from './personalityNarrationSubagent'

/** 重跑参数快照：按 kind 由执行器（pipeline retrySeam）解释。以后新增易失败环节在此加成员。 */
export type RoundRetryUnitPayload =
  | { kind: 'actor'; speakerTargetId: string; userText: string }
  | { kind: 'narration'; call: PersonalityNarrationCall; profileId: string; insertAfterMessageId?: number }

export interface RoundRetryUnit {
  /** 单元稳定 id（同 id 重复登记=覆盖并累计 attempts）：如 `actor:<speakerTargetId>`、`narration:<profileId>:<n>`。 */
  id: string
  kind: RoundRetryUnitPayload['kind']
  /** 人话标签（提调/用户可读）：如「张元英 消息生成」「旁白生成（环境描写）」。 */
  label: string
  sessionId: string
  /** 所属轮锚（该轮用户消息 id）：同会话出现**不同锚**的登记即视为新轮，旧轮单元自动清掉。 */
  anchorMessageId: number
  lastError: string
  /** 已失败次数（含自动重试）。 */
  attempts: number
  payload: RoundRetryUnitPayload
}

/** 给提调工具/协议看的摘要（不含 payload——参数快照只归执行器）。 */
export interface RoundRetryUnitSummary {
  id: string
  kind: RoundRetryUnit['kind']
  label: string
  lastError: string
  attempts: number
}

// 会话分桶（模块级单例·轮级生命周期）：Map<sessionId, Map<unitId, unit>>。
const unitsBySession = new Map<string, Map<string, RoundRetryUnit>>()

function toSummary(unit: RoundRetryUnit): RoundRetryUnitSummary {
  return { id: unit.id, kind: unit.kind, label: unit.label, lastError: unit.lastError, attempts: unit.attempts }
}

/** 登记一个失败单元（同 id 覆盖并累计 attempts；同会话不同轮锚的旧单元自动清掉——注册表永远只描述「当前这一轮」）。 */
export function registerRoundRetryUnit(unit: RoundRetryUnit): void {
  const sessionId = String(unit.sessionId || '').trim()
  if (!sessionId || !String(unit.id || '').trim()) return
  let bucket = unitsBySession.get(sessionId)
  if (!bucket) {
    bucket = new Map()
    unitsBySession.set(sessionId, bucket)
  }
  // 新轮锚 → 清旧轮残留（防上一轮失败单元漂到下一轮的纠偏清单里）。
  for (const [id, existing] of bucket) {
    if (existing.anchorMessageId !== unit.anchorMessageId) bucket.delete(id)
  }
  const prior = bucket.get(unit.id)
  bucket.set(unit.id, { ...unit, attempts: (prior ? prior.attempts : 0) + Math.max(1, unit.attempts || 1) })
}

/** 列当前失败单元（anchorMessageId 提供时只列该轮的·防跨轮残留误列）。 */
export function listRoundRetryUnits(sessionId: string, anchorMessageId?: number): RoundRetryUnitSummary[] {
  const bucket = unitsBySession.get(String(sessionId || '').trim())
  if (!bucket) return []
  const anchor = Number(anchorMessageId || 0)
  return [...bucket.values()]
    .filter((unit) => !anchor || unit.anchorMessageId === anchor)
    .map(toSummary)
}

/** 取出一个单元（重试执行前调用；重试成功即自然移除，失败由执行器重新 register 放回）。 */
export function takeRoundRetryUnit(sessionId: string, unitId: string): RoundRetryUnit | null {
  const bucket = unitsBySession.get(String(sessionId || '').trim())
  const unit = bucket?.get(String(unitId || '').trim())
  if (!bucket || !unit) return null
  bucket.delete(unit.id)
  return unit
}

/** 清会话的失败单元；传 keepAnchorMessageId 时只清「不属于该轮锚」的旧轮残留（新轮开局调用）。 */
export function clearRoundRetryUnits(sessionId: string, keepAnchorMessageId?: number): void {
  const bucket = unitsBySession.get(String(sessionId || '').trim())
  if (!bucket) return
  const keep = Number(keepAnchorMessageId || 0)
  if (!keep) {
    bucket.clear()
    return
  }
  for (const [id, unit] of bucket) {
    if (unit.anchorMessageId !== keep) bucket.delete(id)
  }
}

export interface AutoRetryOptions {
  /** 额外自动重试次数（默认 1 次）。 */
  retries?: number
  /** 每次重试前的缓冲等待（默认 5000ms·用户拍板「重试前等 5s 缓冲」）。 */
  delayMs?: number
  signal?: AbortSignal
  /** 停止请求等外部软停：返回 true 即不再重试、原错误上抛。 */
  shouldAbort?: () => boolean
  /** 每次将要重试时回调（打日志/带子提示用）。 */
  onRetry?: (attempt: number, error: unknown) => void
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** 可被 signal 打断的缓冲等待。 */
function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 通用自动重试缓冲：fn 抛错且非 abort/软停 → 等 delayMs 再试，最多 retries 次；仍失败抛最后一次错误。
 * abort（AbortError / signal.aborted / shouldAbort()）永不重试——用户主动停下不算「易失败环节」。
 */
export async function runWithAutoRetry<T>(fn: () => Promise<T> | T, options: AutoRetryOptions = {}): Promise<T> {
  const retries = Math.max(0, Math.round(Number(options.retries ?? 1)))
  const delayMs = Math.max(0, Math.round(Number(options.delayMs ?? 5000)))
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      options.onRetry?.(attempt, lastError)
      await sleepWithSignal(delayMs, options.signal)
      if (options.signal?.aborted || options.shouldAbort?.()) throw lastError
    }
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (isAbortLikeError(error) || options.signal?.aborted || options.shouldAbort?.()) throw error
    }
  }
  throw lastError
}
