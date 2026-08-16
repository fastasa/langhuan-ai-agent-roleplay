// 人格模型 ReRanker 推理路由：决定本次评审走「浏览器本地推理」还是「服务端推理」，并在失败时按平台选择回退/降级。
// 真值边界（2026-06-17 计划书）：
// - 桌面端默认本地推理，浏览器带不动（本地失败）时有权限自动回退服务端，服务端再失败才抛出由 harness 降级。
// - 移动端默认服务端推理（有权限），失败直接抛出由 harness 降级（移动端浏览器本身带不动本地）。
// - 任何「评审失败」最终都不在这里吞掉，而是抛回 harness，由其 buildDegradedReviewResult 统一降级；取消信号原样抛出。
// 开源版默认放行本机服务端推理；serverAllowed 只保留为调用方的能力开关。

import { API } from '../config/api'
import { shouldUseMobileWorkspace } from '../components/mobile-workspace/mobileWorkspaceSurface'
import type { PersonalityRerankerScoreResult } from '../../shared/personalityRerankerCore'

export type { PersonalityRerankerScoreResult } from '../../shared/personalityRerankerCore'

// 推理位置偏好：auto（按平台自动）/ local（强制本地）/ server（强制服务端）。
export type PersonalityInferenceMode = 'auto' | 'local' | 'server'
// 实际落点：本地浏览器推理 / 服务端推理。
export type PersonalityInferenceTarget = 'local' | 'server'

type ScoreInput = {
  personalityModelPath: string
  situation: string
  plans: string[]
}

/** 纯逻辑：根据偏好、是否移动端、是否被授予服务端推理，解析本次评审落点。 */
export function resolvePersonalityInferenceTarget(input: {
  mode: PersonalityInferenceMode
  isMobile: boolean
  serverAllowed: boolean
}): PersonalityInferenceTarget {
  if (input.mode === 'local') return 'local'
  if (input.mode === 'server') return input.serverAllowed ? 'server' : 'local'
  // auto：移动端优先服务端（有权限），桌面端优先本地。
  return input.isMobile && input.serverAllowed ? 'server' : 'local'
}

function isAbortError(error: unknown): boolean {
  if (!error) return false
  const name = (error as { name?: string }).name
  const message = String((error as { message?: string }).message || '')
  return name === 'AbortError' || message.includes('aborted') || message.includes('ABORTED')
}

async function scoreViaServer(input: ScoreInput, abortSignal?: AbortSignal): Promise<PersonalityRerankerScoreResult> {
  const response = await fetch(API.PERSONALITY_RERANKER_SCORE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelPath: input.personalityModelPath,
      situation: input.situation,
      plans: input.plans
    }),
    signal: abortSignal
  })
  if (!response.ok) {
    let message = `人格模型服务端推理失败(${response.status})`
    let code = ''
    try {
      const body = await response.json()
      if (body?.error) message = String(body.error)
      if (body?.code) code = String(body.code)
    } catch {
      // 忽略解析失败，沿用默认文案
    }
    const error = new Error(message) as Error & { code?: string; status?: number }
    error.code = code
    error.status = response.status
    throw error
  }
  const data = await response.json()
  if (!data || !Array.isArray(data.scores)) {
    throw new Error('人格模型服务端推理返回格式异常')
  }
  return data as PersonalityRerankerScoreResult
}

async function scoreViaLocal(input: ScoreInput): Promise<PersonalityRerankerScoreResult> {
  const { scorePersonalityPlansDetailed } = await import('./personalityRerankerBrowser')
  return scorePersonalityPlansDetailed(input)
}

function safeIsMobile(): boolean {
  try {
    if (typeof window === 'undefined') return false
    return shouldUseMobileWorkspace(window.location?.search || '')
  } catch {
    return false
  }
}

/**
 * 按路由对候选计划打分。失败语义与本地推理一致（抛出由 harness 降级），仅取消信号原样抛出。
 * @param opts.mode 推理偏好，默认 auto。
 * @param opts.isMobile 是否移动端，默认按当前 surface 自动判定。
 * @param opts.serverAllowed 是否允许服务端推理，默认 true。
 */
export async function scorePersonalityPlansRouted(
  input: ScoreInput,
  opts: {
    abortSignal?: AbortSignal
    mode?: PersonalityInferenceMode
    isMobile?: boolean
    serverAllowed?: boolean
  } = {}
): Promise<PersonalityRerankerScoreResult> {
  const mode: PersonalityInferenceMode = opts.mode || 'auto'
  const isMobile = opts.isMobile ?? safeIsMobile()
  const serverAllowed = opts.serverAllowed ?? true
  const target = resolvePersonalityInferenceTarget({ mode, isMobile, serverAllowed })

  if (target === 'server') {
    try {
      return await scoreViaServer(input, opts.abortSignal)
    } catch (error) {
      if (isAbortError(error)) throw error
      // 桌面端显式选服务端但失败 → 回退本地；移动端无法本地推理 → 抛出由 harness 降级。
      if (!isMobile) return await scoreViaLocal(input)
      throw error
    }
  }
  try {
    return await scoreViaLocal(input)
  } catch (error) {
    if (isAbortError(error)) throw error
    // 桌面端浏览器带不动（本地失败）→ 有权限时自动回退服务端；服务端再失败则抛出由 harness 降级。
    if (serverAllowed) return await scoreViaServer(input, opts.abortSignal)
    throw error
  }
}
