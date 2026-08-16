/**
 * 「设问」人格问卷出题子 Agent。
 *
 * 鉴心只负责判断“为什么要出、失败后要怎么纠正”；设问在独立后台 loop 中执行正式制卷，
 * 读取质量门诊断后最多做三次整体验收尝试，成功后用 submitQuestionnaireGeneration 交卷。
 * 主 Agent 停止只会中断鉴心当轮，不会把这里的后台 signal 一并取消。
 */

import type { ToolDefinition } from './agentRuntime/toolRegistry'
import type { PersonalityQuestionnaireDraft, PersonalityQuestionnaireGenerationDiagnostic } from './personalityTrainingWorkflow'
import { readQuestionnaireGenerationDiagnostic } from './personalityTrainingWorkflow'
import {
  runSubagentLoop,
  SUBAGENT_LOOP_TIMEOUT_MS,
  type SubagentLoopCallModel
} from './subagentLoop'
import { assembleAgentSkillSupply } from './agentSupply'
import {
  READ_FULL_PERSONALITY_QUESTION_HISTORY_TOOL,
  renderPersonalityQuestionHistory,
  type PersonalityQuestionHistorySnapshot
} from './personalityQuestionHistory'

export const PERSONALITY_QUESTION_AUTHOR_AGENT_NAME = '设问'
export const PERSONALITY_QUESTION_AUTHOR_SUBAGENT_ID_PREFIX = 'personality-question-author'
export const PERSONALITY_QUESTION_AUTHOR_ATTEMPT_TOOL = 'generateQuestionnaireAttempt'
export const PERSONALITY_QUESTION_AUTHOR_SUBMIT_TOOL = 'submitQuestionnaireGeneration'
export const PERSONALITY_QUESTION_AUTHOR_MAX_ATTEMPTS = 3

export const PERSONALITY_QUESTION_AUTHOR_SYSTEM_PROMPT = [
  '你是「设问」——琅嬛人格训练工作区中由鉴心派出的后台制卷员。你不和用户闲聊，不改人格正文，也不训练模型；你的唯一职责是按正式问卷协议完成本次制卷并结构化交卷。',
  '这是复杂长任务：第一动作必须调用 writeTaskTodo，一次写清“生成并通过质量门”和“交卷回执”两项验收；达到验收后及时用 updateTaskTodo 标记完成。',
  `TODO 建好后，必须先调用 ${READ_FULL_PERSONALITY_QUESTION_HISTORY_TOOL}，全量读取现有训练题和冻结评测题；没有旧题也必须取得空历史回执。只看截断摘要或上一轮记忆不算完成。`,
  '全量读取成功后再调用 generateQuestionnaireAttempt。工具会复核历史指纹；checkpoint 或其它写入使历史变化后，必须重新全量读取再重试。工具成功表示整卷已经通过代码质量门；随后完成 TODO，并调用 submitQuestionnaireGeneration 交卷。',
  '工具失败时要读完整错误与 diagnostic。若 retryable=true，必须把具体题号、违规规则和改写约束压缩成 correctionBrief，再调用 generateQuestionnaireAttempt 续跑；不得原样重发空纠错，也不得只在正文里说会重试。',
  `最多允许 ${PERSONALITY_QUESTION_AUTHOR_MAX_ATTEMPTS} 次制卷尝试。次数用尽、超时或非重试错误时如实结束，不得伪造交卷。`,
  'simple 题的纠错必须明确要求删除转折、连续变化、隐藏信息和第二决策点；不要用同义替换绕过质量门。覆盖深度交给整套题量。',
  '每道新题必须提供具体 scenarioType、low/medium/high pressureLevel 和 diversityNote；同维度的“情境类型 + 压力程度”组合不能与全量历史重复，只换人名、地点或措辞不算新情境。',
  '只有 submitQuestionnaireGeneration 的成功回执才算完成；正文里的“已完成”不算。'
].join('\n')

export type PersonalityQuestionAuthorMode =
  | 'create_new'
  | 'resume'
  | 'restart_current'
  | 'append_batch'
  | 'frozen_evaluation'

export interface PersonalityQuestionAuthorInput {
  taskId: string
  sessionId: string
  characterName: string
  datasetId: string
  mode: PersonalityQuestionAuthorMode
  /** 鉴心根据上一份后台失败回执写出的定向纠错要求。 */
  correctionBrief?: string
}

export interface PersonalityQuestionAuthorFailure {
  message: string
  attempt: number
  retryable: boolean
  diagnostic: PersonalityQuestionnaireGenerationDiagnostic | null
}

export interface PersonalityQuestionAuthorResult {
  ok: boolean
  cancelled?: boolean
  attempts: number
  draft: PersonalityQuestionnaireDraft | null
  summary: string
  failure: PersonalityQuestionAuthorFailure | null
}

export interface RunPersonalityQuestionAuthorDeps {
  readQuestionHistory(): Promise<PersonalityQuestionHistorySnapshot>
  generateAttempt(input: {
    attempt: number
    correctionBrief: string
    signal?: AbortSignal
  }): Promise<PersonalityQuestionnaireDraft>
  callModel: SubagentLoopCallModel
  timeoutMs?: number
}

function createQuestionHistoryTool(
  deps: RunPersonalityQuestionAuthorDeps,
  holder: {
    historySignature: string
    historyFingerprint: string
  }
): ToolDefinition {
  return {
    name: READ_FULL_PERSONALITY_QUESTION_HISTORY_TOOL,
    brief: '全量读取当前数据集的所有训练题和当前生效冻结评测题，包含每道完整题干、情境类型与压力程度；候选与答案不参与情境查重，因此不重复倾倒。任何生成尝试前必调；历史变化后必须重读。',
    schema: { type: 'object', additionalProperties: false, properties: {} },
    execute: async () => {
      try {
        const history = await deps.readQuestionHistory()
        holder.historySignature = history.signature
        holder.historyFingerprint = history.fingerprint
        return {
          content: renderPersonalityQuestionHistory(history),
          status: 'success',
          details: {
            kind: 'fullPersonalityQuestionHistory',
            historyFingerprint: history.fingerprint,
            totalQuestions: history.entries.length
          }
        }
      } catch (error) {
        return {
          content: `全量读取历史题目失败：${error instanceof Error ? error.message : String(error)}`,
          status: 'error',
          error: {
            type: 'TOOL_RUNTIME_ERROR',
            message: '全量读取历史题目失败',
            retryable: true
          }
        }
      }
    }
  }
}

function clip(value: unknown, limit = 1600): string {
  const text = String(value ?? '').replace(/\s+/gu, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function renderBrief(input: PersonalityQuestionAuthorInput): string {
  return [
    `【后台制卷任务】${input.characterName || '当前角色'} · ${input.mode}`,
    `taskId=${input.taskId}`,
    `datasetId=${input.datasetId}`,
    input.correctionBrief
      ? `【鉴心纠错要求】\n${input.correctionBrief}`
      : '【鉴心纠错要求】\n无；先按正式协议制卷，收到质量门诊断后再自行定向纠正。',
    '',
    '完成后必须调用 submitQuestionnaireGeneration 交卷。'
  ].join('\n')
}

function createAttemptTool(
  input: PersonalityQuestionAuthorInput,
  deps: RunPersonalityQuestionAuthorDeps,
  holder: {
    attempts: number
    draft: PersonalityQuestionnaireDraft | null
    failure: PersonalityQuestionAuthorFailure | null
    historySignature: string
    historyFingerprint: string
  }
): ToolDefinition {
  return {
    name: PERSONALITY_QUESTION_AUTHOR_ATTEMPT_TOOL,
    longRunning: true,
    brief: `运行一次真实问卷生成/续跑并经过代码质量门。失败时回传结构化 diagnostic；最多 ${PERSONALITY_QUESTION_AUTHOR_MAX_ATTEMPTS} 次，重试必须提供针对上次错误的 correctionBrief。`,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        correctionBrief: {
          type: 'string',
          description: '首次可复用鉴心要求；重试必填：列出失败题号、违规规则与明确改写约束。'
        }
      }
    },
    execute: async (call, ctx) => {
      if (!holder.historySignature) {
        return {
          content: `生成前必须先调用 ${READ_FULL_PERSONALITY_QUESTION_HISTORY_TOOL}，全量读取所有既有题目。`,
          status: 'error',
          error: {
            type: 'EXPECTATION_MISMATCH',
            message: '尚未全量读取历史题目',
            retryable: true
          }
        }
      }
      try {
        const latestHistory = await deps.readQuestionHistory()
        if (latestHistory.signature !== holder.historySignature) {
          holder.historySignature = ''
          holder.historyFingerprint = ''
          return {
            content: `题目历史在上次全量读取后已经变化。请重新调用 ${READ_FULL_PERSONALITY_QUESTION_HISTORY_TOOL}，再开始本次生成尝试。`,
            status: 'error',
            error: {
              type: 'EXPECTATION_MISMATCH',
              message: '历史题目已变化，需要重新全量读取',
              retryable: true
            }
          }
        }
      } catch (error) {
        return {
          content: `生成前复核历史题目失败：${error instanceof Error ? error.message : String(error)}`,
          status: 'error',
          error: {
            type: 'TOOL_RUNTIME_ERROR',
            message: '生成前无法复核历史题目',
            retryable: true
          }
        }
      }
      if (holder.attempts >= PERSONALITY_QUESTION_AUTHOR_MAX_ATTEMPTS) {
        return {
          content: `设问已用尽 ${PERSONALITY_QUESTION_AUTHOR_MAX_ATTEMPTS} 次制卷尝试，不能继续。`,
          status: 'error',
          error: {
            type: 'BUDGET_EXCEEDED',
            message: '后台制卷尝试次数已用尽',
            retryable: false
          }
        }
      }
      const correctionBrief = clip(
        String(call.args.correctionBrief || '').trim()
          || (holder.attempts === 0 ? input.correctionBrief : ''),
        1800
      )
      if (holder.attempts > 0 && !correctionBrief) {
        return {
          content: '重试必须提供 correctionBrief，写清上一轮失败题号、规则和改写约束；不得原样空重试。',
          status: 'error',
          error: {
            type: 'INVALID_ARGUMENT',
            message: '重试缺少定向 correctionBrief',
            retryable: true
          }
        }
      }
      const attempt = holder.attempts + 1
      holder.attempts = attempt
      try {
        const draft = await deps.generateAttempt({
          attempt,
          correctionBrief,
          ...(ctx.signal ? { signal: ctx.signal } : {})
        })
        holder.draft = draft
        holder.failure = null
        return {
          content: `第 ${attempt} 次制卷已通过正式质量门：训练题 ${draft.questionGroups.length}，冻结评测题 ${draft.evaluationQuestions.length}。现在完成 TODO 并调用 ${PERSONALITY_QUESTION_AUTHOR_SUBMIT_TOOL} 交卷。`,
          status: 'success',
          details: {
            kind: 'personalityQuestionnaireAttempt',
            attempt,
            trainingQuestionCount: draft.questionGroups.length,
            evaluationQuestionCount: draft.evaluationQuestions.length
          }
        }
      } catch (error) {
        const diagnostic = readQuestionnaireGenerationDiagnostic(error)
        const message = error instanceof Error ? error.message : String(error)
        const retryable = attempt < PERSONALITY_QUESTION_AUTHOR_MAX_ATTEMPTS
        holder.draft = null
        holder.failure = { message, attempt, retryable, diagnostic }
        const violations = diagnostic?.qualityViolations?.length
          ? `\n质量门明细：\n${diagnostic.qualityViolations.map((item) => `- ${item}`).join('\n')}`
          : ''
        return {
          content: [
            `第 ${attempt} 次制卷失败：${message}`,
            diagnostic ? `stage=${diagnostic.stage}；likelyTruncated=${diagnostic.likelyTruncated}` : '',
            violations,
            retryable
              ? '请根据上述题号和规则写出新的 correctionBrief 后重试；不要原样重发。'
              : '尝试次数已用尽，请停止并把失败如实交回鉴心。'
          ].filter(Boolean).join('\n'),
          status: 'error',
          error: {
            type: 'TOOL_RUNTIME_ERROR',
            message,
            retryable,
            details: { attempt, diagnostic }
          },
          details: { kind: 'personalityQuestionnaireAttemptFailure', attempt, diagnostic }
        }
      }
    }
  }
}

function createSubmitTool(
  holder: {
    attempts: number
    draft: PersonalityQuestionnaireDraft | null
    failure: PersonalityQuestionAuthorFailure | null
    result: PersonalityQuestionAuthorResult | null
  }
): ToolDefinition {
  return {
    name: PERSONALITY_QUESTION_AUTHOR_SUBMIT_TOOL,
    brief: '整卷已通过 generateQuestionnaireAttempt 质量门后交卷。没有成功草稿时禁止调用。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string', description: '简短说明生成题量、是否从 checkpoint 续跑及纠错次数。' }
      },
      required: ['summary']
    },
    validateArgs: (args) => String(args.summary || '').trim() ? null : 'submitQuestionnaireGeneration 缺少 summary',
    execute: (call) => {
      if (!holder.draft) {
        return {
          content: '尚无通过质量门的草稿，不能交卷。先调用 generateQuestionnaireAttempt。',
          status: 'error',
          error: {
            type: 'EXPECTATION_MISMATCH',
            message: '没有通过质量门的草稿',
            retryable: true
          }
        }
      }
      const summary = clip(call.args.summary, 800)
      holder.result = {
        ok: true,
        attempts: holder.attempts,
        draft: holder.draft,
        summary,
        failure: null
      }
      return {
        content: '设问已交卷；后台任务可以进入落库和通知阶段。',
        status: 'success',
        details: {
          kind: 'personalityQuestionnaireSubmit',
          attempts: holder.attempts,
          trainingQuestionCount: holder.draft.questionGroups.length,
          evaluationQuestionCount: holder.draft.evaluationQuestions.length
        }
      }
    }
  }
}

export async function runPersonalityQuestionAuthorSubagent(
  input: PersonalityQuestionAuthorInput,
  deps: RunPersonalityQuestionAuthorDeps
): Promise<PersonalityQuestionAuthorResult> {
  const holder: {
    attempts: number
    draft: PersonalityQuestionnaireDraft | null
    failure: PersonalityQuestionAuthorFailure | null
    result: PersonalityQuestionAuthorResult | null
    historySignature: string
    historyFingerprint: string
  } = {
    attempts: 0,
    draft: null,
    failure: null,
    result: null,
    historySignature: '',
    historyFingerprint: ''
  }
  const brief = renderBrief(input)
  const skillAssembly = await assembleAgentSkillSupply({
    profileId: 'personality_question_author.background'
  })
  const submitTool = createSubmitTool(holder)
  await runSubagentLoop({
    profileId: 'personality_question_author.background',
    sessionId: input.sessionId,
    subagentId: `${PERSONALITY_QUESTION_AUTHOR_SUBAGENT_ID_PREFIX}:${input.taskId}`,
    loggedInput: brief,
    presentation: {
      label: PERSONALITY_QUESTION_AUTHOR_AGENT_NAME,
      icon: 'list-checks',
      runningVerb: '制卷中',
      title: `${input.characterName || '当前角色'}人格问卷`
    },
    agentName: 'PersonalityQuestionAuthorAgent',
    runtimeVersion: 'personality-question-author-runtime-v1',
    messages: [
      {
        role: 'system',
        content: [
          PERSONALITY_QUESTION_AUTHOR_SYSTEM_PROMPT,
          skillAssembly.layers['0']
        ].filter(Boolean).join('\n\n')
      },
      {
        role: 'system',
        content: `【人格问卷正式设计协议】\n${skillAssembly.layers['4'] || '正式协议由生成工具在每批 prompt 中强制注入；不得自行放宽。'}`
      },
      { role: 'user', content: brief }
    ],
    skillAssembly,
    tools: [createQuestionHistoryTool(deps, holder), createAttemptTool(input, deps, holder)],
    submitTool,
    submitToolName: PERSONALITY_QUESTION_AUTHOR_SUBMIT_TOOL,
    isSubmitted: () => Boolean(holder.result),
    guardSubmitTerminate: true,
    nudgeId: 'personality-question-author-empty-turn-nudge',
    nudgeMaxCount: 2,
    buildNudgeText: () => holder.draft
      ? `草稿已通过质量门，立即完成 TODO 并调用 ${PERSONALITY_QUESTION_AUTHOR_SUBMIT_TOOL} 交卷；正文说明不算交卷。`
      : holder.historySignature
        ? `任务还没交卷。调用 ${PERSONALITY_QUESTION_AUTHOR_ATTEMPT_TOOL}；若刚失败，就根据 diagnostic 写定向 correctionBrief。历史变化时先重新全量读取。`
        : `任务还没交卷。先调用 ${READ_FULL_PERSONALITY_QUESTION_HISTORY_TOOL} 全量读取历史，再调用 ${PERSONALITY_QUESTION_AUTHOR_ATTEMPT_TOOL}。`,
    submitTerminateId: 'personality-question-author-submit-terminate',
    submitTerminateSummary: '设问已通过正式工具交卷',
    submitGrace: {
      submitToolName: PERSONALITY_QUESTION_AUTHOR_SUBMIT_TOOL,
      buildNudge: (_reason, failureHint) => [
        `这是最后的交卷机会：如果已有通过质量门的草稿，立即调用 ${PERSONALITY_QUESTION_AUTHOR_SUBMIT_TOOL}，不要再生成。`,
        failureHint ? `上次交卷失败：${failureHint}` : ''
      ].filter(Boolean).join('\n')
    },
    budget: { maxTurns: 10, maxToolCalls: 12 },
    timeoutMs: deps.timeoutMs ?? SUBAGENT_LOOP_TIMEOUT_MS,
    callModel: deps.callModel,
    onNoSubmit: (reason, detail) => {
      if (holder.result) return
      const reasonText = reason === 'timeout'
        ? `设问后台制卷超时（${Math.max(1, Math.round(detail.timeoutMs / 60_000))} 分钟）`
        : reason === 'aborted'
          ? '设问后台制卷被明确停止'
          : '设问没有通过 submitQuestionnaireGeneration 交卷'
      holder.result = {
        ok: false,
        ...(reason === 'aborted' ? { cancelled: true } : {}),
        attempts: holder.attempts,
        draft: null,
        summary: reasonText,
        failure: holder.failure || {
          message: reasonText,
          attempt: holder.attempts,
          retryable: reason !== 'aborted',
          diagnostic: null
        }
      }
    },
    onCatchError: (message) => {
      holder.result = {
        ok: false,
        attempts: holder.attempts,
        draft: null,
        summary: `设问运行失败：${message}`,
        failure: holder.failure || {
          message,
          attempt: holder.attempts,
          retryable: true,
          diagnostic: null
        }
      }
    },
    buildEndPayload: () => {
      const result = holder.result || {
        ok: false,
        attempts: holder.attempts,
        draft: null,
        summary: '设问没有形成正式交卷回执',
        failure: holder.failure
      }
      return {
        ok: result.ok,
        ...(result.ok ? {} : { error: result.summary }),
        output: result.summary
      }
    }
  })
  return holder.result || {
    ok: false,
    attempts: holder.attempts,
    draft: null,
    summary: '设问没有形成正式交卷回执',
    failure: holder.failure
  }
}

export function renderPersonalityQuestionAuthorNotice(input: {
  characterName: string
  datasetId: string
  result: PersonalityQuestionAuthorResult
}): string {
  if (input.result.ok && input.result.draft) {
    return [
      `【设问后台回报】${input.characterName || '当前角色'}的问卷已经交卷。`,
      `数据集：${input.datasetId}`,
      `训练题 ${input.result.draft.questionGroups.length} 道，冻结评测题 ${input.result.draft.evaluationQuestions.length} 道；共尝试 ${input.result.attempts} 次。`,
      input.result.summary,
      '鉴心可以继续带你检查题目、开始选择或处理下一轮。'
    ].filter(Boolean).join('\n')
  }
  if (input.result.cancelled) {
    return [
      `【设问后台回报】${input.characterName || '当前角色'}的本次制卷已停止。`,
      `数据集：${input.datasetId}`,
      `停止前已尝试 ${input.result.attempts} 次；现有题目与检查点保留。`,
      '这不是失败重试信号，也不是完成回执。若要调整后重派，鉴心应先读取正式题数与检查点，再把新要求写进 correctionBrief 创建新任务。'
    ].join('\n')
  }
  const diagnostic = input.result.failure?.diagnostic
  return [
    `【设问后台回报】${input.characterName || '当前角色'}的问卷仍未通过质量门。`,
    `数据集：${input.datasetId}`,
    `已尝试 ${input.result.attempts} 次；${input.result.failure?.message || input.result.summary}`,
    ...(diagnostic?.qualityViolations?.length
      ? ['质量门明细：', ...diagnostic.qualityViolations.map((item) => `- ${item}`)]
      : []),
    diagnostic?.stage ? `失败阶段：${diagnostic.stage}` : '',
    '这不是完成回执。鉴心下一轮应读取当前检查点与本条诊断，写出定向 correctionBrief 后再派设问续跑。'
  ].filter(Boolean).join('\n')
}
