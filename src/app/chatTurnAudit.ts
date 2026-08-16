import {
  createChatGenerationAttemptBySessionId,
  updateChatGenerationAttemptBySessionId
} from '../repositories/chatRepository'

export interface StartChatGenerationAttemptInput {
  sessionId: string
  anchorMessageId: number
  triggerType: string
  mode: 'clean' | 'prompt_replay'
  targetId: string
  speakerName: string
  parentAttemptId?: string
  replacedMessageIds?: number[]
  sourcePromptLogId?: string
  // 轮级提调主键：一轮一条、群聊一轮所有发言者共享同一个；缺省时单点兜底生成，保证每条 attempt 都有非空 runId。
  tidiaoRunId?: string
  onError?: (error: unknown) => void
}

// 生成轮级提调主键。沿用项目 id 惯例 `${prefix}_${Date.now()}_${rand}`，可按时间排序。
// 真值：同一轮（含群聊多发言者）应复用同一个，由发送链路在轮入口生成一次后下发；此处仅作非空兜底。
export function makeTidiaoRunId(): string {
  return `tidiao_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export interface FinishChatGenerationAttemptInput {
  attemptId: string
  sessionId: string
  status: 'completed' | 'failed'
  assistantMessageIds?: number[]
  outputPromptLogId?: string
  error?: unknown
  formatErrorMessage?: (error: unknown) => string
  onError?: (error: unknown) => void
  retryDelayMs?: number
}

const FINISH_GENERATION_ATTEMPT_MAX_TRIES = 3

function isTransientGenerationAttemptUpdateError(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status || 0)
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true
  const message = String((error as Error | null)?.message || error || '').toLowerCase()
  return /network|failed to fetch|econnreset|econnrefused|temporarily unavailable|bad gateway/.test(message)
}

async function waitBeforeGenerationAttemptRetry(attemptIndex: number, retryDelayMs: number) {
  const delay = Math.max(0, retryDelayMs) * attemptIndex
  if (delay <= 0) return
  await new Promise<void>((resolve) => setTimeout(resolve, delay))
}

export async function startChatGenerationAttempt(input: StartChatGenerationAttemptInput): Promise<string> {
  if (!input.sessionId || !input.anchorMessageId) return ''
  try {
    const result = await createChatGenerationAttemptBySessionId(input.sessionId, {
      anchorMessageId: input.anchorMessageId,
      parentAttemptId: input.parentAttemptId,
      triggerType: input.triggerType,
      mode: input.mode,
      status: 'running',
      targetId: input.targetId,
      speakerName: input.speakerName,
      tidiaoRunId: input.tidiaoRunId || makeTidiaoRunId(),
      replacedMessageIds: input.replacedMessageIds || [],
      sourcePromptLogId: input.sourcePromptLogId
    })
    return String(result.id || '')
  } catch (error) {
    input.onError?.(error)
    return ''
  }
}

export async function finishChatGenerationAttempt(input: FinishChatGenerationAttemptInput): Promise<void> {
  if (!input.attemptId || !input.sessionId) return
  const payload = {
    status: input.status,
    assistantMessageIds: input.assistantMessageIds || [],
    outputPromptLogId: input.outputPromptLogId || '',
    errorJson: input.error
      ? { message: input.formatErrorMessage ? input.formatErrorMessage(input.error) : String(input.error) }
      : {}
  }
  const retryDelayMs = input.retryDelayMs ?? 300
  let lastError: unknown = null
  for (let attemptIndex = 0; attemptIndex < FINISH_GENERATION_ATTEMPT_MAX_TRIES; attemptIndex += 1) {
    try {
      await waitBeforeGenerationAttemptRetry(attemptIndex, retryDelayMs)
      await updateChatGenerationAttemptBySessionId(input.sessionId, input.attemptId, payload)
      return
    } catch (error) {
      lastError = error
      if (!isTransientGenerationAttemptUpdateError(error) || attemptIndex >= FINISH_GENERATION_ATTEMPT_MAX_TRIES - 1) break
    }
  }
  input.onError?.(lastError)
}
