import {
  bindChatPromptLogMessageBySessionId,
  createChatPromptLogBySessionId,
  createChatRecallActivityLogBySessionId,
  createChatMessageBySessionId,
  updateChatMessageBySessionId
} from '../repositories/chatRepository'
import {
  buildNarrationContinuityMarkerUpdates,
  generateNarrationContent,
  type NarrationGenerationInput,
  type NarrationGenerationResult
} from './narrationGeneration'
import { shouldNarrationProfileEnterContext } from './narrationProtocol'

export interface NarrationChatWriteInput extends NarrationGenerationInput {
  /** 串行压缩批C1（2026-07-13）：生成（callAI+解析）完成、落库（createChatMessageBySessionId）前的可选等待钩子——
   *  供调用方接保序落库链 `narrationReleaseChain`（段内并行·落库仍按声明序）或穿插旁白预生成的锚点等待
   *  （锚点角色真实落库拿到 id 前先等）。返回值可携带覆盖锚点，本模块自身不使用该字段，只透传给调用方。
   *  不传=现状逐字不变（生成完立即落库）。 */
  beforePersist?: () => Promise<{ insertAfterMessageId?: number } | void>
}

export interface NarrationChatWriteResult extends NarrationGenerationResult {
  messageId?: number
  promptLogId?: string
  recallActivityLogId?: string
  /** beforePersist 返回值透传：非 undefined 时调用方应据此覆盖显示锚点（_localInsertAfterMessageId）。 */
  insertAfterMessageIdOverride?: number
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function resolveSessionId(input: NarrationGenerationInput): string {
  return toText(input.session.id ?? input.session.sessionId ?? input.session.session_id)
}

function readTargetId(input: NarrationGenerationInput): string {
  return toText((input.session as Record<string, unknown>).targetId ?? (input.session as Record<string, unknown>).target_id)
}

export function buildNarrationRecallActivity(input: {
  sessionId: string
  messageId: number
  generation: NarrationGenerationResult
  source: NarrationGenerationInput
  now?: string
}): Record<string, unknown> | null {
  const recallEvidence = [
    ...(input.source.recallEvidence || [])
  ]
  const seen = new Set<string>()
  const normalizedEvidence = recallEvidence.filter((item) => {
    const key = `${item.documentId}:${item.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!normalizedEvidence.length) return null
  const now = input.now || new Date().toISOString()
  return {
    id: `narration_recall_${input.sessionId}_${input.messageId}`,
    status: 'completed',
    characterName: '旁白',
    startedAt: now,
    completedAt: now,
    events: [
      {
        id: `narration_recall_${input.messageId}_summary`,
        runId: `narration_recall_${input.sessionId}_${input.messageId}`,
        stepKey: 'narration_recall_evidence',
        stepLabel: '旁白召回证据',
        status: 'completed',
        startedAt: now,
        completedAt: now,
        input: {
          narrationKind: input.source.plan.narrationKind
        },
        output: {
          summary: normalizedEvidence.map((item) => ({
            documentId: item.documentId,
            title: item.title,
            displayPath: item.displayPath,
            documentType: item.documentType,
            semanticType: item.semanticType,
            score: item.score,
            reason: item.reason,
            summary: item.summary
          }))
        },
        metrics: {
          confirmedUnits: normalizedEvidence.map((item) => ({
            id: item.documentId,
            title: item.title,
            semanticType: item.semanticType,
            score: item.score,
            readDecision: 'summary',
            summary: item.summary || item.reason
          }))
        }
      }
    ],
    result: {
      confirmedIds: normalizedEvidence.map((item) => item.documentId),
      confirmedTitles: normalizedEvidence.map((item) => item.title),
      source: 'narration_recall_evidence'
    },
    publicMilestones: [
      {
        id: `narration_recall_${input.messageId}_public`,
        title: '我查过旁白依据',
        text: normalizedEvidence.length ? `纳入 ${normalizedEvidence.length} 条旁白召回证据` : '没有纳入额外证据',
        status: 'completed',
        sourceEventIds: [`narration_recall_${input.messageId}_summary`]
      }
    ]
  }
}

export async function generateAndWriteNarration(input: NarrationChatWriteInput): Promise<NarrationChatWriteResult> {
  const sessionId = resolveSessionId(input)
  if (!sessionId) throw new Error('缺少旁白写入会话 ID')
  const generated = await generateNarrationContent(input)
  if (input.abortSignal?.aborted) {
    const error = new Error('旁白写入已停止')
    error.name = 'AbortError'
    throw error
  }
  if (generated.skipped || !generated.messagePayload) return generated
  // beforePersist 钩子：生成完成、落库前的最窄等待点——段内保序落库链在此排队，
  // 穿插旁白预生成在此等锚点角色真实落库拿到 id。等待期间也可能变成「已停止」，等完要再查一次。
  let insertAfterMessageIdOverride: number | undefined
  if (input.beforePersist) {
    const override = await input.beforePersist()
    if (input.abortSignal?.aborted) {
      const error = new Error('旁白写入已停止')
      error.name = 'AbortError'
      throw error
    }
    if (override && typeof override.insertAfterMessageId === 'number') {
      insertAfterMessageIdOverride = override.insertAfterMessageId
    }
  }
  const messageId = await createChatMessageBySessionId(sessionId, generated.messagePayload)
  const continuityMarkerUpdates = buildNarrationContinuityMarkerUpdates({
    messages: input.continuityMessages || input.messages,
    narrationProfile: input.narrationProfile,
    newMessageId: messageId,
    newMessagePayload: generated.messagePayload
  })
  for (const update of continuityMarkerUpdates) {
    if (update.messageId === messageId) continue
    await updateChatMessageBySessionId(sessionId, update.messageId, {
      autoWriteBatchId: update.autoWriteBatchId,
      auto_write_batch_id: update.autoWriteBatchId
    })
  }
  let promptLogId = ''
  if (generated.promptTrace) {
    const promptLog = await createChatPromptLogBySessionId(sessionId, {
      speakerName: '旁白',
      targetId: readTargetId(input),
      finalPrompt: generated.promptTrace.finalPrompt,
      promptBlocks: generated.promptTrace.promptBlocks
    })
    promptLogId = toText(promptLog.id)
    if (promptLogId) {
      await bindChatPromptLogMessageBySessionId(sessionId, promptLogId, messageId)
    }
  }
  const includeInContext = shouldNarrationProfileEnterContext(input.narrationProfile)
  const recallActivity = includeInContext ? buildNarrationRecallActivity({
    sessionId,
    messageId,
    generation: generated,
    source: input,
    now: input.now
  }) : null
  let recallActivityLogId = ''
  if (recallActivity) {
    const activityLog = await createChatRecallActivityLogBySessionId(sessionId, {
      speakerName: '旁白',
      targetId: readTargetId(input),
      inputMessageId: 0,
      assistantMessageId: messageId,
      activity: recallActivity
    })
    recallActivityLogId = toText(activityLog.id)
  }
  return {
    ...generated,
    messageId,
    promptLogId,
    recallActivityLogId,
    insertAfterMessageIdOverride
  }
}
