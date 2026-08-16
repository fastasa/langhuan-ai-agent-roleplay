import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import {
  askConfirmWrite,
  requireConfirmWriteChannel,
  type ConfirmWriteChannel
} from './agentRuntime/interactionContract'

export const PERSONALITY_QUESTION_AUTHOR_DISPATCH_CONFIRM_TITLE = '确认派遣设问后台制卷'
export const PERSONALITY_QUESTION_BATCH_CONFIRM_TITLE_PREFIX = '确认追加训练题 '

export function isPersonalityQuestionBatchConfirmation(title: string): boolean {
  return title.startsWith(PERSONALITY_QUESTION_BATCH_CONFIRM_TITLE_PREFIX)
    && title.endsWith(' 道')
}
import { invalidArgs, runtimeError } from './agentHarnessShared'
import {
  findPersonalityQuestionDesignViolations,
  findPersonalityQuestionDiversityViolations,
  resolvePersonalityQuestionAnswer,
  summarizePersonalityAdaptiveCalibration,
  type PersonalityAnswerMap,
  type PersonalityAdaptiveCalibrationSummary,
  type PersonalityCalibrationRoundReview,
  type PersonalityEvaluationSet,
  type PersonalityModelVersion,
  type PersonalityPrecheckResult,
  type PersonalityQuestionGroup,
  type PersonalityTrainingDataset,
  type PersonalityTrainingRun
} from './personalityTrainingWorkflow'
import {
  buildPersonalityQuestionHistorySnapshot,
  READ_FULL_PERSONALITY_QUESTION_HISTORY_TOOL,
  renderPersonalityQuestionHistory,
  type PersonalityQuestionHistorySnapshot
} from './personalityQuestionHistory'
import type { PersonalityTrainingBackgroundTaskSnapshot } from './personalityTrainingBackgroundTasks'
import { MAX_REVISED_PERSONALITY_CHARS } from './personalityCalibration'
import { PERSONALITY_CALIBRATION_ROUND_SIZE } from '../../shared/personalityQuestionnaireDesign'

export type PersonalityTrainingQuestionScope = 'training' | 'evaluation'

export interface PersonalityTrainingAgentDatasetSummary {
  datasetId: string
  title: string
  status: string
  totalQuestions: number
  answeredQuestions: number
  skippedQuestions: number
  unansweredQuestions: number
  confirmedQuestions?: number
  presetQuestions?: number
  /** 最近一次设问失败的正式诊断；成功制卷会由 prompt snapshot 清空。 */
  lastGenerationFailure?: Record<string, unknown> | null
}

export interface PersonalityTrainingAgentEvaluationSummary {
  evalSetId: string
  status: string
  totalQuestions: number
  answeredQuestions: number
  skippedQuestions: number
  unansweredQuestions: number
  confirmedQuestions?: number
  presetQuestions?: number
  metrics?: Record<string, unknown>
}

export type PersonalityTrainingAgentRunSummary = Omit<PersonalityTrainingRun, 'logPath'>
export type PersonalityTrainingAgentModelVersionSummary = Omit<PersonalityModelVersion, 'modelPath'> & {
  hasModel: boolean
}

/** 鉴心每轮只常驻的正式阶段摘要；完整题目必须通过分页工具按需读取。 */
export interface PersonalityTrainingAgentWorkspaceSnapshot {
  characterId: string
  characterName: string
  /** 当前角色正式 personality 字段全文；鉴心重写前必须以这里或专用 provider 重读值为准。 */
  personalityText: string
  activeStepId?: string
  dataset: PersonalityTrainingAgentDatasetSummary | null
  calibration: PersonalityAdaptiveCalibrationSummary | null
  evaluationSet: PersonalityTrainingAgentEvaluationSummary | null
  backgroundTasks: PersonalityTrainingBackgroundTaskSnapshot[]
  trainingRuns: PersonalityTrainingAgentRunSummary[]
  /** 不把本机 modelPath 放进 Agent prompt / transcript；实际评测由 provider 内部按 versionId 解析。 */
  modelVersions: PersonalityTrainingAgentModelVersionSummary[]
}

export interface PersonalityTrainingQuestionCollection {
  resourceId: string
  questions: PersonalityQuestionGroup[]
  answers: PersonalityAnswerMap
}

export interface PersonalityTrainingCharacterPersonalityRecord {
  characterId: string
  characterName: string
  personality: string
}

export interface PersonalityTrainingAgentProvider {
  readSnapshot(): Promise<PersonalityTrainingAgentWorkspaceSnapshot> | PersonalityTrainingAgentWorkspaceSnapshot
  readQuestions(scope: PersonalityTrainingQuestionScope): Promise<PersonalityTrainingQuestionCollection>
  deleteQuestions(
    scope: PersonalityTrainingQuestionScope,
    questionIds: string[]
  ): Promise<PersonalityTrainingQuestionCollection>
  saveQuestions(
    scope: PersonalityTrainingQuestionScope,
    questions: PersonalityQuestionGroup[]
  ): Promise<PersonalityTrainingQuestionCollection>
  saveAnswers(
    scope: PersonalityTrainingQuestionScope,
    answers: PersonalityAnswerMap
  ): Promise<PersonalityTrainingQuestionCollection>
  startQuestionnaireGeneration(
    mode: 'create_new' | 'resume' | 'restart_current',
    correctionBrief?: string,
    questionCount?: number
  ): Promise<Record<string, unknown>>
  recordCalibrationRoundReview(review: Omit<PersonalityCalibrationRoundReview, 'reviewedAt'>): Promise<Record<string, unknown>>
  startQuestionBatch(questionCount: number): Promise<Record<string, unknown>>
  startFrozenEvaluationGeneration(questionCount: number): Promise<Record<string, unknown>>
  readCharacterPersonality(): Promise<PersonalityTrainingCharacterPersonalityRecord> | PersonalityTrainingCharacterPersonalityRecord
  saveCharacterPersonality(personality: string): Promise<PersonalityTrainingCharacterPersonalityRecord>
  precheckTraining(): Promise<PersonalityPrecheckResult>
  startTraining(payload: Record<string, unknown>): Promise<PersonalityTrainingRun>
  listTrainingRuns(): Promise<PersonalityTrainingRun[]>
  getTrainingRun(runId: string): Promise<PersonalityTrainingRun>
  getTrainingRunLog(runId: string): Promise<{ runId: string; log: string }>
  cancelTraining(runId: string): Promise<PersonalityTrainingRun>
  startEvaluation(versionId: string): Promise<Record<string, unknown>>
  installModelVersion(versionId: string): Promise<PersonalityModelVersion>
  deleteModelVersion(versionId: string): Promise<PersonalityModelVersion>
  /** 工具写入成功后通知工作台刷新其它步骤的派生视图。 */
  onChanged?(): void | Promise<void>
}

export interface PersonalityTrainingAgentToolContext {
  provider: PersonalityTrainingAgentProvider
  confirmWrite?: ConfirmWriteChannel
  /** 单次鉴心运行内的历史读取门禁；不进入 provider 或持久化。 */
  questionHistoryReadState?: {
    signature: string
    fingerprint: string
  }
}

type QuestionState = 'confirmed' | 'preset' | 'unresolved'

function scopeLabel(scope: PersonalityTrainingQuestionScope) {
  return scope === 'training' ? '训练问卷' : '冻结评测问卷'
}

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function clip(value: unknown, limit = 80) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

async function readCompleteQuestionHistory(
  context: PersonalityTrainingAgentToolContext
): Promise<PersonalityQuestionHistorySnapshot> {
  const snapshot = await context.provider.readSnapshot()
  const [training, evaluation] = await Promise.all([
    snapshot.dataset
      ? context.provider.readQuestions('training')
      : Promise.resolve({ resourceId: '', questions: [], answers: {} }),
    snapshot.evaluationSet
      ? context.provider.readQuestions('evaluation')
      : Promise.resolve({ resourceId: '', questions: [], answers: {} })
  ])
  return buildPersonalityQuestionHistorySnapshot({
    training: {
      resourceId: training.resourceId,
      questions: training.questions
    },
    evaluation: {
      resourceId: evaluation.resourceId,
      questions: evaluation.questions
    }
  })
}

function questionFingerprint(question: PersonalityQuestionGroup | undefined) {
  if (!question) return ''
  return JSON.stringify({
    id: question.id,
    question: question.question,
    dimension: question.dimension,
    difficulty: question.difficulty,
    scenarioType: question.scenarioType || '',
    pressureLevel: question.pressureLevel || '',
    diversityNote: question.diversityNote || '',
    candidates: (question.candidates || []).map((candidate) => ({
      id: candidate.id,
      text: candidate.text,
      label: candidate.label
    })),
    presetAnswerId: question.presetAnswerId || '',
    sourceHints: question.sourceHints || []
  })
}

function answerState(question: PersonalityQuestionGroup, answers: PersonalityAnswerMap): QuestionState {
  return resolvePersonalityQuestionAnswer(question, answers)?.source || 'unresolved'
}

export function renderPersonalityTrainingWorkspaceSnapshot(snapshot: PersonalityTrainingAgentWorkspaceSnapshot) {
  const dataset = snapshot.dataset
    ? `${snapshot.dataset.title || snapshot.dataset.datasetId}：${snapshot.dataset.answeredQuestions}/${snapshot.dataset.totalQuestions} 有效答案（人工 ${snapshot.dataset.confirmedQuestions ?? snapshot.dataset.answeredQuestions}，预设代选 ${snapshot.dataset.presetQuestions ?? 0}），${snapshot.dataset.unansweredQuestions} 未解决`
    : '尚无训练数据集'
  const evaluation = snapshot.evaluationSet
    ? `${snapshot.evaluationSet.answeredQuestions}/${snapshot.evaluationSet.totalQuestions} 有效答案（人工 ${snapshot.evaluationSet.confirmedQuestions ?? snapshot.evaluationSet.answeredQuestions}，预设代选 ${snapshot.evaluationSet.presetQuestions ?? 0}），${snapshot.evaluationSet.unansweredQuestions} 未解决`
    : '尚无冻结评测集'
  const activeTasks = snapshot.backgroundTasks.filter((task) => task.status === 'running')
  const lastGenerationFailure = snapshot.dataset?.lastGenerationFailure
  const activeRuns = snapshot.trainingRuns.filter((run) => ['pending', 'preparing', 'running', 'importing'].includes(String(run.status || '')))
  const installed = snapshot.modelVersions.filter((version) => Boolean(version.installedAt) || version.status === 'installed')
  const calibration = snapshot.calibration
  const nextRound = calibration?.rounds.find((round) => !round.reviewed)
  const latestRound = calibration?.rounds[calibration.rounds.length - 1]
  return [
    `角色：${snapshot.characterName || snapshot.characterId}`,
    `角色当前性格正文：${snapshot.personalityText || '（未填写）'}`,
    `当前步骤：${snapshot.activeStepId || '未知'}`,
    `训练问卷：${dataset}`,
    calibration
      ? `校准轮次：共 ${calibration.rounds.length} 轮；${nextRound?.complete ? `第 ${nextRound.roundNumber} 轮已人工确认完毕，待复盘` : latestRound ? `第 ${latestRound.roundNumber} 轮人工确认 ${latestRound.confirmedCount}/${latestRound.questionCount}` : '尚未开始'}；${calibration.rollingPresetHitRate === null ? '尚无双轮命中率' : `最近 ${calibration.targetWindowRounds} 轮预设命中率 ${Math.round(calibration.rollingPresetHitRate * 100)}%`}${calibration.canSuggestStop ? '，可以提示用户考虑收束' : ''}`
      : '校准轮次：尚无训练问卷',
    `评测问卷：${evaluation}`,
    `后台任务：${activeTasks.length ? activeTasks.map((task) => `${task.workerAgentName || task.kind}:${task.progress?.label || task.status}`).join('；') : '无运行中任务'}`,
    `最近设问失败：${lastGenerationFailure ? compactJson(lastGenerationFailure) : '无'}`,
    `训练运行：${activeRuns.length ? activeRuns.map((run) => `${run.runId}:${run.status}`).join('；') : '无运行中训练'}`,
    `模型版本：${snapshot.modelVersions.length} 个；当前安装 ${installed.map((version) => version.versionId).join('、') || '无'}`
  ].join('\n')
}

function hasQuestionMutationBlocker(snapshot: PersonalityTrainingAgentWorkspaceSnapshot) {
  const generation = snapshot.backgroundTasks.find((task) => task.kind === 'questionnaire_generation' && task.status === 'running')
  if (generation) return `问卷生成任务仍在运行（${generation.progress?.label || generation.taskId}），checkpoint 可能覆盖修改`
  const training = snapshot.trainingRuns.find((run) => ['pending', 'preparing', 'running', 'importing'].includes(String(run.status || '')))
  if (training) return `训练运行 ${training.runId} 仍处于 ${training.status}，本次训练使用的数据快照尚未结束`
  return ''
}

function resolveQuestionIndex(
  questions: PersonalityQuestionGroup[],
  target: { questionId?: unknown; questionNumber?: unknown }
) {
  const questionId = String(target.questionId || '').trim()
  if (questionId) return questions.findIndex((question) => question.id === questionId)
  const questionNumber = Math.trunc(Number(target.questionNumber))
  return Number.isFinite(questionNumber) && questionNumber >= 1 && questionNumber <= questions.length
    ? questionNumber - 1
    : -1
}

async function requireWriteConfirmation(
  context: PersonalityTrainingAgentToolContext,
  request: { title: string; lines: string[] },
  action: string
): Promise<ToolExecutionResult | null> {
  const missing = requireConfirmWriteChannel(context.confirmWrite, action)
  if (missing) return missing
  return askConfirmWrite(context.confirmWrite!, request, action)
}

function createReadWorkspaceTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'readPersonalityTrainingWorkspace',
    brief: '读取当前角色人格训练工作区的正式摘要：人工确认/预设代选/未解决数量、评测集、后台出题/评测任务、训练运行和模型版本。只读，不返回整套题目。回答进度或执行任何写操作前先调用。',
    schema: { type: 'object', additionalProperties: false, properties: {} },
    execute: async () => {
      try {
        const snapshot = await context.provider.readSnapshot()
        return {
          content: renderPersonalityTrainingWorkspaceSnapshot(snapshot),
          status: 'success',
          details: { snapshot }
        }
      } catch (error) {
        return runtimeError(`读取人格训练工作区失败：${(error as Error).message}`)
      }
    }
  }
}

function createReadQuestionsTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'readPersonalityTrainingQuestions',
    brief: '按训练/评测范围读取题目、三个选项、预设答案与人工答案。可按维度及 confirmed/preset/unconfirmed/unresolved 筛选，或用 questionIds 精确读取；单次最多 10 题。批量改题前必须先读目标原文。',
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        scope: { type: 'string', enum: ['training', 'evaluation'], description: '训练题或冻结评测题。' },
        answerState: { type: 'string', enum: ['all', 'confirmed', 'preset', 'unconfirmed', 'unresolved'], description: 'unconfirmed 包含 preset 与 unresolved；缺省 all。' },
        dimension: { type: 'string', description: '可选，精确筛选中文维度名。' },
        start: { type: 'integer', minimum: 1, description: '筛选结果中的 1-based 起始位置，缺省 1。' },
        limit: { type: 'integer', minimum: 1, maximum: 10, description: '单次最多 10，缺省 10。' },
        questionIds: { type: 'array', maxItems: 10, items: { type: 'string' }, description: '精确读取这些正式题目 ID；提供后忽略 start。' }
      },
      required: ['scope']
    },
    execute: async (call) => {
      const args = call.args as Record<string, unknown>
      const scope = String(args.scope || '') as PersonalityTrainingQuestionScope
      if (scope !== 'training' && scope !== 'evaluation') return invalidArgs('scope 必须是 training 或 evaluation')
      try {
        const collection = await context.provider.readQuestions(scope)
        const requestedIds = Array.isArray(args.questionIds)
          ? args.questionIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 10)
          : []
        const filter = String(args.answerState || 'all')
        const dimension = String(args.dimension || '').trim()
        const indexed = collection.questions.map((question, index) => ({
          question,
          questionNumber: index + 1,
          state: answerState(question, collection.answers)
        }))
        let selected = requestedIds.length
          ? requestedIds.map((id) => indexed.find((item) => item.question.id === id)).filter(Boolean) as typeof indexed
          : indexed.filter((item) => {
            const matchesState = filter === 'all'
              || item.state === filter
              || (filter === 'unconfirmed' && item.state !== 'confirmed')
            return matchesState && (!dimension || item.question.dimension === dimension)
          })
        const start = Math.max(1, Math.trunc(Number(args.start) || 1))
        const limit = Math.min(10, Math.max(1, Math.trunc(Number(args.limit) || 10)))
        if (!requestedIds.length) selected = selected.slice(start - 1, start - 1 + limit)
        const rows = selected.map(({ question, questionNumber, state }) => {
          const explicitAnswer = collection.answers[question.id] || null
          const effectiveAnswer = resolvePersonalityQuestionAnswer(question, collection.answers)
          return {
            questionNumber,
            questionId: question.id,
            question: question.question,
            dimension: question.dimension,
            difficulty: question.difficulty,
            scenarioType: question.scenarioType || '',
            pressureLevel: question.pressureLevel || '',
            diversityNote: question.diversityNote || '',
            candidates: question.candidates,
            presetAnswerId: question.presetAnswerId || '',
            answerState: state,
            userAnswer: explicitAnswer,
            effectiveAnswerId: effectiveAnswer?.candidateId || '',
            effectiveAnswerSource: effectiveAnswer?.source || 'unresolved'
          }
        })
        return {
          content: `已读取${scopeLabel(scope)} ${rows.length} 题。\n${compactJson(rows)}`,
          status: 'success',
          details: {
            scope,
            resourceId: collection.resourceId,
            totalQuestions: collection.questions.length,
            returnedQuestions: rows
          }
        }
      } catch (error) {
        return runtimeError(`读取${scopeLabel(scope)}失败：${(error as Error).message}`)
      }
    }
  }
}

function createReadQuestionHistoryTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: READ_FULL_PERSONALITY_QUESTION_HISTORY_TOOL,
    brief: '一次读取当前角色全部训练题与冻结评测题的完整题干、维度、情境类型和压力程度，建立全题库查重指纹。候选与答案不影响情境重复判断，因此不重复倾倒；需要候选详情时另用分页读题工具。新增或改写题干前必须调用。',
    schema: { type: 'object', additionalProperties: false, properties: {} },
    execute: async () => {
      try {
        const history = await readCompleteQuestionHistory(context)
        if (context.questionHistoryReadState) {
          context.questionHistoryReadState.signature = history.signature
          context.questionHistoryReadState.fingerprint = history.fingerprint
        }
        return {
          content: renderPersonalityQuestionHistory(history),
          status: 'success',
          details: {
            kind: 'fullPersonalityQuestionHistory',
            historyFingerprint: history.fingerprint,
            totalQuestions: history.entries.length,
            trainingQuestions: history.entries.filter((entry) => entry.scope === 'training').length,
            evaluationQuestions: history.entries.filter((entry) => entry.scope === 'evaluation').length
          }
        }
      } catch (error) {
        return runtimeError(`全量读取人格题目历史失败：${(error as Error).message}`)
      }
    }
  }
}

function createDeleteQuestionsTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'deletePersonalityTrainingQuestions',
    longRunning: true,
    brief: '删除现有训练题或冻结评测题。可按题目 ID/当前题号删除任意题，也可一次删除所有“没有人工 confirmed 答案”的题（包括预设代选与未解决题）。人工已确认题允许删除，不设硬保护；但会连同人工答案一起删除，并使删除点所在校准轮及后续复盘失效，所以确认摘要会特别警示。写后重读核验。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scope: { type: 'string', enum: ['training', 'evaluation'], description: '训练题或冻结评测题。' },
        selectionMode: {
          type: 'string',
          enum: ['specified', 'all_without_human_answer'],
          description: 'specified 按 questionIds/questionNumbers 删除；all_without_human_answer 删除全部没有人工 confirmed 答案的题。'
        },
        questionIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'selectionMode=specified 时可用；正式题目 ID。'
        },
        questionNumbers: {
          type: 'array',
          items: { type: 'integer', minimum: 1 },
          description: 'selectionMode=specified 时可用；基于写前重读结果的当前 1-based 题号。'
        }
      },
      required: ['scope', 'selectionMode']
    },
    execute: async (call) => {
      const args = call.args as Record<string, unknown>
      const scope = String(args.scope || '') as PersonalityTrainingQuestionScope
      const selectionMode = String(args.selectionMode || '')
      if (scope !== 'training' && scope !== 'evaluation') return invalidArgs('scope 必须是 training 或 evaluation')
      if (!['specified', 'all_without_human_answer'].includes(selectionMode)) {
        return invalidArgs('selectionMode 必须是 specified 或 all_without_human_answer')
      }
      try {
        const snapshot = await context.provider.readSnapshot()
        const blocker = hasQuestionMutationBlocker(snapshot)
        if (blocker) return runtimeError(`现在不能删除问卷题目：${blocker}。请等任务结束后重读再删。`)
        const collection = await context.provider.readQuestions(scope)
        const selectedIndexes = new Set<number>()
        if (selectionMode === 'all_without_human_answer') {
          collection.questions.forEach((question, index) => {
            if (answerState(question, collection.answers) !== 'confirmed') selectedIndexes.add(index)
          })
        } else {
          const questionIds = Array.isArray(args.questionIds)
            ? args.questionIds.map((id) => String(id || '').trim()).filter(Boolean)
            : []
          const questionNumbers = Array.isArray(args.questionNumbers)
            ? args.questionNumbers.map((value) => Math.trunc(Number(value))).filter((value) => Number.isFinite(value))
            : []
          if (!questionIds.length && !questionNumbers.length) {
            return invalidArgs('selectionMode=specified 时至少提供 questionIds 或 questionNumbers')
          }
          for (const questionId of questionIds) {
            const index = collection.questions.findIndex((question) => question.id === questionId)
            if (index < 0) return invalidArgs(`找不到题目 ID：${questionId}`)
            selectedIndexes.add(index)
          }
          for (const questionNumber of questionNumbers) {
            if (questionNumber < 1 || questionNumber > collection.questions.length) {
              return invalidArgs(`找不到第 ${questionNumber} 题`)
            }
            selectedIndexes.add(questionNumber - 1)
          }
        }

        const indexes = Array.from(selectedIndexes).sort((left, right) => left - right)
        if (!indexes.length) {
          return {
            content: selectionMode === 'all_without_human_answer'
              ? `当前${scopeLabel(scope)}没有需要删除的非人工确认题，未发生写入。`
              : `没有匹配到需要删除的${scopeLabel(scope)}题目，未发生写入。`,
            status: 'success',
            details: { deleted: [], remainingQuestionCount: collection.questions.length }
          }
        }
        const targets = indexes.map((index) => {
          const question = collection.questions[index]
          return {
            index,
            question,
            state: answerState(question, collection.answers),
            questionFingerprint: questionFingerprint(question),
            answerFingerprint: JSON.stringify(collection.answers[question.id] ?? null)
          }
        })
        const confirmedCount = targets.filter((target) => target.state === 'confirmed').length
        const presetCount = targets.filter((target) => target.state === 'preset').length
        const unresolvedCount = targets.length - confirmedCount - presetCount
        const firstAffectedRound = scope === 'training'
          ? Math.floor(targets[0].index / PERSONALITY_CALIBRATION_ROUND_SIZE) + 1
          : 0
        const denied = await requireWriteConfirmation(context, {
          title: `确认删除${scopeLabel(scope)}题目`,
          lines: [
            `准备删除 ${targets.length} 题：${targets.slice(0, 20).map((target) => target.index + 1).join('、')}${targets.length > 20 ? '…' : ''}`,
            `答案来源：人工确认 ${confirmedCount}，预设代选 ${presetCount}，未解决 ${unresolvedCount}`,
            confirmedCount
              ? `警示：其中 ${confirmedCount} 题已经人工确认；仍允许删除，但对应人工答案会一并删除。`
              : '本次不包含人工确认题。',
            ...(scope === 'training'
              ? [`第 ${firstAffectedRound} 轮及其后的复盘会退出正式真值，保留更早且未受影响的完整轮次。`]
              : []),
            '删除后不可通过本工具自动恢复；如需保留内容，请先另行记录。'
          ]
        }, `删除${scopeLabel(scope)}题目`)
        if (denied) return denied

        const latestSnapshot = await context.provider.readSnapshot()
        const latestBlocker = hasQuestionMutationBlocker(latestSnapshot)
        if (latestBlocker) return runtimeError(`确认期间工作区状态已变化，不能继续删除：${latestBlocker}。`)
        const latest = await context.provider.readQuestions(scope)
        if (latest.resourceId !== collection.resourceId) {
          return runtimeError('确认期间当前数据集/评测集已经切换，本次没有删除，请重读目标题目。')
        }
        for (const target of targets) {
          const latestQuestion = latest.questions.find((question) => question.id === target.question.id)
          if (
            !latestQuestion
            || questionFingerprint(latestQuestion) !== target.questionFingerprint
            || JSON.stringify(latest.answers[target.question.id] ?? null) !== target.answerFingerprint
          ) {
            return runtimeError(`确认期间第 ${target.index + 1} 题或其人工答案已经变化，本次整批没有删除，请重读后再处理。`)
          }
        }

        const targetIds = targets.map((target) => target.question.id)
        await context.provider.deleteQuestions(scope, targetIds)
        const verified = await context.provider.readQuestions(scope)
        const residualIds = targetIds.filter((questionId) => (
          verified.questions.some((question) => question.id === questionId)
          || Object.prototype.hasOwnProperty.call(verified.answers, questionId)
        ))
        if (residualIds.length) {
          return runtimeError(`删除后核验失败，仍残留题目或答案：${residualIds.join('、')}。`)
        }
        await context.provider.onChanged?.()
        return {
          content: `已删除并核验${scopeLabel(scope)} ${targets.length} 题；剩余 ${verified.questions.length} 题。${confirmedCount ? `其中删除了 ${confirmedCount} 题人工确认记录。` : ''}`,
          status: 'success',
          details: {
            deleted: targets.map((target) => ({
              questionNumber: target.index + 1,
              questionId: target.question.id,
              answerState: target.state
            })),
            deletedConfirmedCount: confirmedCount,
            deletedPresetCount: presetCount,
            deletedUnresolvedCount: unresolvedCount,
            remainingQuestionCount: verified.questions.length,
            ...(scope === 'training' ? { invalidatedFromRound: firstAffectedRound } : {})
          }
        }
      } catch (error) {
        return runtimeError(`删除${scopeLabel(scope)}题目失败：${(error as Error).message}`)
      }
    }
  }
}

type QuestionPatchInput = {
  questionId?: unknown
  questionNumber?: unknown
  question?: unknown
  scenarioType?: unknown
  pressureLevel?: unknown
  diversityNote?: unknown
  candidatePatches?: unknown
  presetAnswerId?: unknown
}

function createPatchQuestionsTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'patchPersonalityTrainingQuestions',
    longRunning: true,
    brief: `精确修改 1 题、同一维度完整 10 题，或一次原子重写训练问卷中连续完整的 ${PERSONALITY_CALIBRATION_ROUND_SIZE} 题校准轮次。可改题干、候选文本、预设答案；候选 ID 和三选项结构不变。人工已确认题默认受保护，用户明确要求重写整轮时用 includeAnswered=true。整批只保存一次并重读核验。`,
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        scope: { type: 'string', enum: ['training', 'evaluation'] },
        includeAnswered: { type: 'boolean', description: '缺省 false；只有用户明确要求修改已答题时才能设 true。' },
        changes: {
          type: 'array', minItems: 1, maxItems: PERSONALITY_CALIBRATION_ROUND_SIZE,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              questionId: { type: 'string' },
              questionNumber: { type: 'integer', minimum: 1 },
              question: { type: 'string', description: '可选的新题干。' },
              scenarioType: { type: 'string', description: '改写题干时必填；具体事件机制，不得照抄九维名称。' },
              pressureLevel: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: '改写题干时必填；处境压力程度，不是 simple/complex。'
              },
              diversityNote: {
                type: 'string',
                description: '改写题干时必填；指出相对全量历史中最接近旧题的类型/程度差异。'
              },
              candidatePatches: {
                type: 'array', minItems: 1, maxItems: 3,
                items: {
                  type: 'object', additionalProperties: false,
                  properties: {
                    candidateId: { type: 'string' },
                    text: { type: 'string' }
                  },
                  required: ['candidateId', 'text']
                }
              },
              presetAnswerId: { type: 'string', description: '新的预设答案候选 ID。' }
            }
          }
        }
      },
      required: ['scope', 'changes']
    },
    execute: async (call) => {
      const args = call.args as Record<string, unknown>
      const scope = String(args.scope || '') as PersonalityTrainingQuestionScope
      if (scope !== 'training' && scope !== 'evaluation') return invalidArgs('scope 必须是 training 或 evaluation')
      const changes = Array.isArray(args.changes)
        ? args.changes.slice(0, PERSONALITY_CALIBRATION_ROUND_SIZE) as QuestionPatchInput[]
        : []
      if (!changes.length) return invalidArgs('changes 至少需要一项')
      if (![1, 10, PERSONALITY_CALIBRATION_ROUND_SIZE].includes(changes.length)) {
        return invalidArgs(`改题颗粒只允许精确 1 题、同一维度完整 10 题，或连续完整 ${PERSONALITY_CALIBRATION_ROUND_SIZE} 题训练轮次`)
      }
      try {
        const snapshot = await context.provider.readSnapshot()
        const blocker = hasQuestionMutationBlocker(snapshot)
        if (blocker) return runtimeError(`现在不能修改问卷：${blocker}。请等任务结束后重读再改。`)
        const changesQuestionSituation = changes.some((change) => change.question !== undefined)
        let fullHistory: PersonalityQuestionHistorySnapshot | null = null
        if (changesQuestionSituation) {
          fullHistory = await readCompleteQuestionHistory(context)
          if (
            !context.questionHistoryReadState?.signature
            || context.questionHistoryReadState.signature !== fullHistory.signature
          ) {
            return invalidArgs(
              '改写题干前必须先调用 readFullPersonalityQuestionHistory 全量读取当前训练题和冻结评测题；历史已变化时也必须重新读取。'
            )
          }
        }
        const collection = await context.provider.readQuestions(scope)
        const nextQuestions = collection.questions.map((question) => ({
          ...question,
          candidates: (question.candidates || []).map((candidate) => ({ ...candidate }))
        }))
        const includeAnswered = args.includeAnswered === true
        const prepared: Array<{ index: number; questionId: string; changedFields: string[] }> = []
        const originalFingerprints = new Map<string, string>()
        const seen = new Set<number>()

        const targetIndexes = changes.map((change) => resolveQuestionIndex(nextQuestions, change))
        const targetQuestions = targetIndexes.map((index) => index >= 0 ? nextQuestions[index] : null)
        if (targetQuestions.some((question) => !question)) return invalidArgs('批次中存在找不到的题目，请先重读正式题号/ID')
        if (changes.length === 10 && new Set(targetQuestions.map((question) => question!.dimension)).size !== 1) {
          return invalidArgs(`10 题批次必须全部属于同一维度；重写跨维度校准轮次时请一次提交连续完整 ${PERSONALITY_CALIBRATION_ROUND_SIZE} 题`)
        }
        if (changes.length === PERSONALITY_CALIBRATION_ROUND_SIZE) {
          if (scope !== 'training') {
            return invalidArgs(`${PERSONALITY_CALIBRATION_ROUND_SIZE} 题整轮重写只适用于训练问卷`)
          }
          const orderedIndexes = [...new Set(targetIndexes)].sort((left, right) => left - right)
          const roundStart = orderedIndexes[0]
          const isCompleteRound = orderedIndexes.length === PERSONALITY_CALIBRATION_ROUND_SIZE
            && roundStart % PERSONALITY_CALIBRATION_ROUND_SIZE === 0
            && orderedIndexes.every((index, offset) => index === roundStart + offset)
          if (!isCompleteRound) {
            return invalidArgs(
              `${PERSONALITY_CALIBRATION_ROUND_SIZE} 题批次必须恰好覆盖一个连续完整校准轮次，例如第 61—80 题`
            )
          }
        }

        for (const change of changes) {
          const index = resolveQuestionIndex(nextQuestions, change)
          if (index < 0) return invalidArgs(`找不到题目：questionId=${String(change.questionId || '')} questionNumber=${String(change.questionNumber || '')}`)
          if (seen.has(index)) return invalidArgs(`同一批不能重复修改第 ${index + 1} 题`)
          seen.add(index)
          const current = nextQuestions[index]
          originalFingerprints.set(current.id, questionFingerprint(collection.questions[index]))
          const state = answerState(current, collection.answers)
          if (state === 'confirmed' && !includeAnswered) {
            return invalidArgs(`第 ${index + 1} 题已有人工答案，默认受保护；请精确改其它单题，或在用户明确要求后设置 includeAnswered=true`)
          }
          if ((current.candidates || []).length !== 3) return invalidArgs(`第 ${index + 1} 题不是三选项结构，已拒绝修改`)
          const changedFields: string[] = []
          if (change.question !== undefined) {
            const question = String(change.question || '').trim()
            if (!question) return invalidArgs(`第 ${index + 1} 题的新题干不能为空`)
            const scenarioType = String(change.scenarioType || '').trim()
            const pressureLevel = String(change.pressureLevel || '').trim()
            const diversityNote = String(change.diversityNote || '').trim()
            if (!scenarioType) return invalidArgs(`第 ${index + 1} 题改写题干时必须提供 scenarioType`)
            if (!['low', 'medium', 'high'].includes(pressureLevel)) {
              return invalidArgs(`第 ${index + 1} 题改写题干时 pressureLevel 必须是 low/medium/high`)
            }
            if (!diversityNote) return invalidArgs(`第 ${index + 1} 题改写题干时必须提供 diversityNote`)
            current.question = question
            current.scenarioType = scenarioType
            current.pressureLevel = pressureLevel as 'low' | 'medium' | 'high'
            current.diversityNote = diversityNote
            changedFields.push('question', 'scenarioType', 'pressureLevel', 'diversityNote')
          }
          if (change.candidatePatches !== undefined) {
            if (!Array.isArray(change.candidatePatches) || !change.candidatePatches.length) {
              return invalidArgs(`第 ${index + 1} 题 candidatePatches 必须是非空数组`)
            }
            const candidateSeen = new Set<string>()
            for (const raw of change.candidatePatches as Array<Record<string, unknown>>) {
              const candidateId = String(raw.candidateId || '').trim()
              const text = String(raw.text || '').trim()
              if (!candidateId || !text) return invalidArgs(`第 ${index + 1} 题的候选修改缺少 candidateId 或 text`)
              if (candidateSeen.has(candidateId)) return invalidArgs(`第 ${index + 1} 题重复修改候选 ${candidateId}`)
              candidateSeen.add(candidateId)
              const candidate = current.candidates.find((item) => item.id === candidateId)
              if (!candidate) return invalidArgs(`第 ${index + 1} 题不存在候选 ${candidateId}`)
              candidate.text = text
            }
            changedFields.push('candidates')
          }
          if (change.presetAnswerId !== undefined) {
            const presetAnswerId = String(change.presetAnswerId || '').trim()
            if (!current.candidates.some((candidate) => candidate.id === presetAnswerId)) {
              return invalidArgs(`第 ${index + 1} 题的 presetAnswerId=${presetAnswerId} 不属于现有候选`)
            }
            current.presetAnswerId = presetAnswerId
            changedFields.push('presetAnswerId')
          }
          if (!changedFields.length) return invalidArgs(`第 ${index + 1} 题没有提供任何修改字段`)
          if (current.candidates.some((candidate) => !String(candidate.text || '').trim())) {
            return invalidArgs(`第 ${index + 1} 题存在空候选文本`)
          }
          prepared.push({ index, questionId: current.id, changedFields })
        }

        if (changesQuestionSituation && fullHistory) {
          const changedIds = new Set(prepared.map((item) => item.questionId))
          const historyQuestions = fullHistory.entries
            .filter((entry) => !changedIds.has(entry.questionId))
            .map((entry): PersonalityQuestionGroup => ({
              id: entry.questionId,
              question: entry.question,
              dimension: entry.dimension,
              difficulty: entry.difficulty,
              candidates: entry.candidates.map((candidate) => ({
                id: candidate.id,
                text: candidate.text,
                label: candidate.id
              })),
              presetAnswerId: entry.presetAnswerId,
              scenarioType: entry.scenarioType || undefined,
              pressureLevel: entry.pressureLevel || undefined,
              diversityNote: entry.diversityNote || undefined
            }))
          const changedQuestions = prepared.map((item) => nextQuestions[item.index])
          const diversityViolations = findPersonalityQuestionDiversityViolations(
            changedQuestions,
            historyQuestions,
            { requireAuditMetadata: true }
          )
          const designViolations = prepared.flatMap((item) => (
            findPersonalityQuestionDesignViolations([nextQuestions[item.index]], item.index + 1)
          ))
          const violations = [...diversityViolations, ...designViolations]
          if (violations.length) {
            return invalidArgs(`改写题没有通过情境差异与题面质量门：${violations.join('；')}`)
          }
        }

        const denied = await requireWriteConfirmation(context, {
          title: `确认批量修改${scopeLabel(scope)}`,
          lines: [
            `准备修改 ${prepared.length} 题：${prepared.map((item) => item.index + 1).join('、')}`,
            `已答题：${includeAnswered ? '本次明确包含' : '保持保护，不修改'}`,
            ...prepared.slice(0, 6).map((item) => `第 ${item.index + 1} 题：${item.changedFields.join('、')}；${clip(nextQuestions[item.index].question)}`)
          ]
        }, `修改${scopeLabel(scope)}`)
        if (denied) return denied

        const latestSnapshot = await context.provider.readSnapshot()
        const latestBlocker = hasQuestionMutationBlocker(latestSnapshot)
        if (latestBlocker) return runtimeError(`确认期间工作区状态已变化，不能继续修改：${latestBlocker}。`)
        const latest = await context.provider.readQuestions(scope)
        if (latest.resourceId !== collection.resourceId) {
          return runtimeError('确认期间当前数据集/评测集已经切换，本次没有写入，请重读目标题目。')
        }
        if (changesQuestionSituation && fullHistory) {
          const latestHistory = await readCompleteQuestionHistory(context)
          if (latestHistory.signature !== fullHistory.signature) {
            return runtimeError('确认期间全量题目历史已经变化，本次整批没有写入；请重新全量读取后再改。')
          }
        }
        const rebasedQuestions = latest.questions.map((question) => ({
          ...question,
          candidates: (question.candidates || []).map((candidate) => ({ ...candidate }))
        }))
        for (const item of prepared) {
          const latestIndex = rebasedQuestions.findIndex((question) => question.id === item.questionId)
          const expected = nextQuestions[item.index]
          if (latestIndex < 0 || questionFingerprint(rebasedQuestions[latestIndex]) !== originalFingerprints.get(item.questionId)) {
            return runtimeError(`确认期间第 ${item.index + 1} 题已被其它操作修改，本次整批没有写入，请重读后再改。`)
          }
          rebasedQuestions[latestIndex] = expected
        }
        await context.provider.saveQuestions(scope, rebasedQuestions)
        const verified = await context.provider.readQuestions(scope)
        for (const item of prepared) {
          const actual = verified.questions.find((question) => question.id === item.questionId)
          const expected = nextQuestions[item.index]
          if (!actual || questionFingerprint(actual) !== questionFingerprint(expected)) {
            return runtimeError(`写入后核验失败：第 ${item.index + 1} 题与预期不一致，请重读后再处理。`)
          }
        }
        await context.provider.onChanged?.()
        if (changesQuestionSituation && context.questionHistoryReadState) {
          context.questionHistoryReadState.signature = ''
          context.questionHistoryReadState.fingerprint = ''
        }
        return {
          content: `已修改并核验${scopeLabel(scope)} ${prepared.length} 题。`,
          status: 'success',
          details: {
            changed: prepared.map((item) => ({ questionNumber: item.index + 1, questionId: item.questionId, changedFields: item.changedFields }))
          }
        }
      } catch (error) {
        return runtimeError(`修改${scopeLabel(scope)}失败：${(error as Error).message}`)
      }
    }
  }
}

function createSetAnswersTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'setPersonalityTrainingAnswers',
    longRunning: true,
    brief: '按题目 ID/题号写入人工答案。无人工答案时预设答案已自动生效，因此只有用户明确要求改选时才调用。颗粒只允许 1 题或同一维度 10 题，确认后落库并重读核验。',
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        scope: { type: 'string', enum: ['training', 'evaluation'] },
        answers: {
          type: 'array', minItems: 1, maxItems: 10,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              questionId: { type: 'string' },
              questionNumber: { type: 'integer', minimum: 1 },
              candidateId: { type: 'string' }
            },
            required: ['candidateId']
          }
        }
      },
      required: ['scope', 'answers']
    },
    execute: async (call) => {
      const args = call.args as Record<string, unknown>
      const scope = String(args.scope || '') as PersonalityTrainingQuestionScope
      if (scope !== 'training' && scope !== 'evaluation') return invalidArgs('scope 必须是 training 或 evaluation')
      const changes = Array.isArray(args.answers) ? args.answers.slice(0, 10) as Array<Record<string, unknown>> : []
      if (!changes.length) return invalidArgs('answers 至少需要一项')
      if (changes.length !== 1 && changes.length !== 10) return invalidArgs('答题颗粒只允许精确 1 题，或同一维度完整 10 题')
      try {
        const snapshot = await context.provider.readSnapshot()
        const blocker = hasQuestionMutationBlocker(snapshot)
        if (blocker) return runtimeError(`现在不能修改答案：${blocker}。`)
        const collection = await context.provider.readQuestions(scope)
        const nextAnswers: PersonalityAnswerMap = { ...collection.answers }
        const prepared: Array<{ questionId: string; questionNumber: number; value: string; entry: PersonalityAnswerMap[string] }> = []
        const seen = new Set<number>()
        const targetQuestions = changes.map((change) => {
          const index = resolveQuestionIndex(collection.questions, change)
          return index >= 0 ? collection.questions[index] : null
        })
        if (targetQuestions.some((question) => !question)) return invalidArgs('批次中存在找不到的题目，请先重读正式题号/ID')
        if (changes.length === 10 && new Set(targetQuestions.map((question) => question!.dimension)).size !== 1) {
          return invalidArgs('10 题答案批次必须全部属于同一维度；跨维度请按维度依次调用')
        }
        for (const change of changes) {
          const index = resolveQuestionIndex(collection.questions, change)
          if (index < 0) return invalidArgs(`找不到题目：questionId=${String(change.questionId || '')} questionNumber=${String(change.questionNumber || '')}`)
          if (seen.has(index)) return invalidArgs(`同一批不能重复设置第 ${index + 1} 题答案`)
          seen.add(index)
          const question = collection.questions[index]
          const candidateId = String(change.candidateId || '').trim()
          if (!question.candidates.some((candidate) => candidate.id === candidateId)) {
            return invalidArgs(`第 ${index + 1} 题不存在候选 ${candidateId}`)
          }
          nextAnswers[question.id] = { candidateId, reviewState: 'confirmed', skipped: false }
          prepared.push({ questionId: question.id, questionNumber: index + 1, value: candidateId, entry: nextAnswers[question.id] })
        }
        const denied = await requireWriteConfirmation(context, {
          title: `确认写入${scopeLabel(scope)}答案`,
          lines: prepared.map((item) => `第 ${item.questionNumber} 题 → ${item.value}`)
        }, `写入${scopeLabel(scope)}答案`)
        if (denied) return denied
        const latestSnapshot = await context.provider.readSnapshot()
        const latestBlocker = hasQuestionMutationBlocker(latestSnapshot)
        if (latestBlocker) return runtimeError(`确认期间工作区状态已变化，不能继续写答案：${latestBlocker}。`)
        const latest = await context.provider.readQuestions(scope)
        if (latest.resourceId !== collection.resourceId) {
          return runtimeError('确认期间当前数据集/评测集已经切换，本次没有写入答案。')
        }
        const rebasedAnswers: PersonalityAnswerMap = { ...latest.answers }
        for (const item of prepared) rebasedAnswers[item.questionId] = item.entry
        await context.provider.saveAnswers(scope, rebasedAnswers)
        const verified = await context.provider.readQuestions(scope)
        for (const item of prepared) {
          if (compactJson(verified.answers[item.questionId]) !== compactJson(item.entry)) {
            return runtimeError(`写入后核验失败：第 ${item.questionNumber} 题答案与预期不一致。`)
          }
        }
        await context.provider.onChanged?.()
        return {
          content: `已写入并核验 ${prepared.length} 道${scopeLabel(scope)}答案。`,
          status: 'success',
          details: { changed: prepared.map(({ entry: _entry, ...item }) => item) }
        }
      } catch (error) {
        return runtimeError(`写入${scopeLabel(scope)}答案失败：${(error as Error).message}`)
      }
    }
  }
}

function createRewriteCharacterPersonalityTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'rewriteCharacterPersonality',
    brief: `用当前问卷中人工确认的答案作证据，整体重写当前角色的 personality 字段。不是给旧正文打补丁；新正文最多 ${MAX_REVISED_PERSONALITY_CHARS} 字。会展示原文、新正文和证据题号，确认后写入并重读核验。`,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        personality: {
          type: 'string',
          maxLength: MAX_REVISED_PERSONALITY_CHARS,
          description: '可直接覆盖角色 personality 字段的完整短正文；整体重写，不是追加段落或规则清单。'
        },
        evidenceQuestionIds: {
          type: 'array',
          minItems: 1,
          maxItems: 40,
          items: { type: 'string' },
          description: '支撑本次重写的人工确认训练题 ID；不能使用只有预设代选的题。'
        },
        reason: { type: 'string', maxLength: 200, description: '本次整体重写的简短理由。' }
      },
      required: ['personality', 'evidenceQuestionIds', 'reason']
    },
    execute: async (call) => {
      const args = call.args as Record<string, unknown>
      const personality = String(args.personality || '').trim()
      const reason = String(args.reason || '').replace(/\s+/g, ' ').trim()
      const evidenceQuestionIds = Array.isArray(args.evidenceQuestionIds)
        ? [...new Set(args.evidenceQuestionIds.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 40)
        : []
      if (!personality) return invalidArgs('personality 不能为空；需要提供完整的新性格正文')
      if (personality.length > MAX_REVISED_PERSONALITY_CHARS) {
        return invalidArgs(`新性格正文不能超过 ${MAX_REVISED_PERSONALITY_CHARS} 个字符`)
      }
      if (!reason) return invalidArgs('reason 不能为空')
      if (!evidenceQuestionIds.length) return invalidArgs('至少需要 1 道人工确认题作为 evidenceQuestionIds')
      try {
        const before = await context.provider.readCharacterPersonality()
        const collection = await context.provider.readQuestions('training')
        const evidence = evidenceQuestionIds.map((questionId) => {
          const questionIndex = collection.questions.findIndex((question) => question.id === questionId)
          const question = collection.questions[questionIndex]
          const resolved = question ? resolvePersonalityQuestionAnswer(question, collection.answers) : null
          return { questionId, questionIndex, question, resolved }
        })
        const invalidEvidence = evidence.filter((item) => !item.question || item.resolved?.source !== 'confirmed')
        if (invalidEvidence.length) {
          return invalidArgs(`这些证据题不存在或尚未人工确认：${invalidEvidence.map((item) => item.questionId).join('、')}`)
        }
        if (personality === before.personality) {
          return {
            content: '新正文与当前 personality 字段完全相同，本次无需写入。',
            status: 'success',
            details: { unchanged: true }
          }
        }
        const denied = await requireWriteConfirmation(context, {
          title: '确认整体重写角色性格',
          lines: [
            `角色：${before.characterName || before.characterId}`,
            `依据：${evidence.map((item) => `第 ${item.questionIndex + 1} 题`).join('、')}`,
            `理由：${reason}`,
            `原性格：${before.personality || '（未填写）'}`,
            `新性格：${personality}`,
            '写入方式：完整替换 personality 字段，不在旧正文末尾追加补丁'
          ]
        }, '整体重写角色性格')
        if (denied) return denied

        const latestCharacter = await context.provider.readCharacterPersonality()
        const latestCollection = await context.provider.readQuestions('training')
        if (latestCollection.resourceId !== collection.resourceId) {
          return runtimeError('确认期间当前训练数据集已经切换，本次没有写入角色性格。')
        }
        if (latestCharacter.personality !== before.personality) {
          return runtimeError('确认期间角色性格正文已被其它操作修改，本次没有覆盖新版本。')
        }
        for (const item of evidence) {
          const latestQuestion = latestCollection.questions.find((question) => question.id === item.questionId)
          const latestResolved = latestQuestion
            ? resolvePersonalityQuestionAnswer(latestQuestion, latestCollection.answers)
            : null
          if (
            questionFingerprint(latestQuestion) !== questionFingerprint(item.question)
            || latestResolved?.source !== 'confirmed'
            || latestResolved.candidateId !== item.resolved?.candidateId
          ) {
            return runtimeError(`确认期间证据题 ${item.questionId} 已变化，本次没有写入角色性格。`)
          }
        }
        await context.provider.saveCharacterPersonality(personality)
        const verified = await context.provider.readCharacterPersonality()
        if (verified.personality !== personality) {
          return runtimeError('写入后核验失败：角色 personality 字段与预期不一致。')
        }
        await context.provider.onChanged?.()
        return {
          content: `已依据 ${evidence.length} 道人工确认题，整体重写并核验「${verified.characterName || verified.characterId}」的性格正文。`,
          status: 'success',
          details: {
            characterId: verified.characterId,
            evidenceQuestionIds,
            previousLength: before.personality.length,
            nextLength: personality.length
          }
        }
      } catch (error) {
        return runtimeError(`整体重写角色性格失败：${(error as Error).message}`)
      }
    }
  }
}

function createCompleteCalibrationRoundTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'completePersonalityCalibrationRound',
    longRunning: true,
    brief: `在当前 ${PERSONALITY_CALIBRATION_ROUND_SIZE} 道题全部人工确认后，把“更丰满/可能矛盾”等复盘正式记录到数据集。这个工具只完成代码层复盘，不生成、追加或覆盖任何题目；口头复盘后必须调用它，才算正式完成。`,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        assessment: { type: 'string', enum: ['richer', 'possible_conflict', 'mixed', 'stable'] },
        summary: { type: 'string', maxLength: 500 },
        stableTraits: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 180 } },
        contextualTraits: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 180 } },
        possibleContradictions: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 180 } }
      },
      required: ['assessment', 'summary', 'stableTraits', 'contextualTraits', 'possibleContradictions']
    },
    execute: async (call) => {
      const args = call.args as Record<string, unknown>
      const assessment = String(args.assessment || '') as PersonalityCalibrationRoundReview['assessment']
      const summary = String(args.summary || '').replace(/\s+/g, ' ').trim().slice(0, 500)
      const toList = (value: unknown) => Array.isArray(value)
        ? value.map((item) => String(item || '').replace(/\s+/g, ' ').trim().slice(0, 180)).filter(Boolean).slice(0, 12)
        : []
      const stableTraits = toList(args.stableTraits)
      const contextualTraits = toList(args.contextualTraits)
      const possibleContradictions = toList(args.possibleContradictions)
      if (!['richer', 'possible_conflict', 'mixed', 'stable'].includes(assessment)) return invalidArgs('assessment 不合法')
      if (!summary) return invalidArgs('summary 不能为空')
      try {
        const snapshot = await context.provider.readSnapshot()
        const blocker = hasQuestionMutationBlocker(snapshot)
        if (blocker) return runtimeError(`现在不能记录复盘：${blocker}。请等任务结束后重读再记录。`)
        const collection = await context.provider.readQuestions('training')
        const calibration = summarizePersonalityAdaptiveCalibration({
          questionGroups: collection.questions,
          answers: collection.answers,
          promptSnapshot: snapshot.dataset ? (snapshot.calibration ? { adaptiveCalibrationReviews: snapshot.calibration.reviews } : {}) : {}
        })
        const round = calibration.rounds.find((item) => !item.reviewed)
        if (!round) return runtimeError('当前没有待复盘的完整轮次。')
        if (!round.complete) {
          return runtimeError(`第 ${round.roundNumber} 轮还没有全部人工确认：${round.confirmedCount}/${round.questionCount}。预设代选不能算作人工复盘。`)
        }
        const recentComplete = calibration.rounds.filter((item) => item.complete).slice(-calibration.targetWindowRounds)
        const recentConfirmed = recentComplete.reduce((sum, item) => sum + item.confirmedCount, 0)
        const recentHits = recentComplete.reduce((sum, item) => sum + item.presetHitCount, 0)
        const prospectiveRate = recentComplete.length === calibration.targetWindowRounds && recentConfirmed
          ? recentHits / recentConfirmed
          : null
        const canSuggestStop = prospectiveRate !== null
          && prospectiveRate >= calibration.targetPresetHitRate
          && possibleContradictions.length === 0
        const review: Omit<PersonalityCalibrationRoundReview, 'reviewedAt'> = {
          roundNumber: round.roundNumber,
          questionStart: round.questionStart,
          questionEnd: round.questionEnd,
          confirmedCount: round.confirmedCount,
          presetHitCount: round.presetHitCount,
          presetHitRate: round.presetHitRate || 0,
          assessment,
          summary,
          stableTraits,
          contextualTraits,
          possibleContradictions
        }
        const denied = await requireWriteConfirmation(context, {
          title: `确认记录第 ${round.roundNumber} 轮复盘`,
          lines: [
            `本轮：第 ${round.questionStart}-${round.questionEnd} 题，全部 ${round.confirmedCount} 题已人工确认`,
            `预设命中：${round.presetHitCount}/${round.confirmedCount}（${Math.round((round.presetHitRate || 0) * 100)}%），纠正 ${round.correctionCount} 题`,
            `人格判断：${summary}`,
            ...(possibleContradictions.length ? [`待澄清：${possibleContradictions.join('；')}`] : []),
            ...(canSuggestStop ? [`最近 ${calibration.targetWindowRounds} 轮已达到 ${Math.round(prospectiveRate! * 100)}%，现在可以收束。`] : []),
            '本次只写入复盘记录，不会启动设问，也不会新增或覆盖题目。'
          ]
        }, '记录人格校准复盘')
        if (denied) return denied

        const latestSnapshot = await context.provider.readSnapshot()
        const latestBlocker = hasQuestionMutationBlocker(latestSnapshot)
        if (latestBlocker) return runtimeError(`确认期间工作区状态已变化，不能记录复盘：${latestBlocker}。`)
        const latestCollection = await context.provider.readQuestions('training')
        if (latestCollection.resourceId !== collection.resourceId) {
          return runtimeError('确认期间当前训练数据集已经切换，本次没有记录复盘。')
        }
        const latestCalibration = summarizePersonalityAdaptiveCalibration({
          questionGroups: latestCollection.questions,
          answers: latestCollection.answers,
          promptSnapshot: latestSnapshot.calibration ? { adaptiveCalibrationReviews: latestSnapshot.calibration.reviews } : {}
        })
        const latestRound = latestCalibration.rounds.find((item) => !item.reviewed)
        if (
          !latestRound
          || latestRound.roundNumber !== round.roundNumber
          || latestRound.confirmedCount !== round.confirmedCount
          || latestRound.presetHitCount !== round.presetHitCount
        ) {
          return runtimeError('确认期间本轮答案或复盘状态已经变化，本次没有记录复盘。')
        }
        const saved = await context.provider.recordCalibrationRoundReview(review)
        const verifiedSnapshot = await context.provider.readSnapshot()
        const verifiedReview = verifiedSnapshot.calibration?.reviews.find((item) => item.roundNumber === round.roundNumber)
        if (!verifiedReview || verifiedReview.summary !== review.summary) {
          return runtimeError(`写入后核验失败：第 ${round.roundNumber} 轮复盘没有成为正式记录。`)
        }
        await context.provider.onChanged?.()
        return {
          content: [
            `已正式记录并核验第 ${round.roundNumber} 轮复盘：预设命中 ${round.presetHitCount}/${round.confirmedCount}（${Math.round((round.presetHitRate || 0) * 100)}%）。`,
            canSuggestStop ? '最近两轮已经达到建议收束线；这只是提示，不会自动停止或继续。' : '',
            '本次没有生成或追加题目。'
          ].filter(Boolean).join('\n'),
          status: 'success',
          details: { review, canSuggestStop, saved }
        }
      } catch (error) {
        return runtimeError(`记录人格校准复盘失败：${(error as Error).message}`)
      }
    }
  }
}

function createStartQuestionBatchTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'startPersonalityQuestionBatch',
    longRunning: true,
    brief: `按用户明确要求一次追加任意正整数道训练题；questionCount 未填时推荐并默认 ${PERSONALITY_CALIBRATION_ROUND_SIZE} 道，也可一次填写 50、100 或其它数量。它不创建或补写复盘；复盘仍按每 ${PERSONALITY_CALIBRATION_ROUND_SIZE} 题观察窗推荐进行，不是生成硬门槛。每次须等上一批设问终态并重读当前题数，禁止并发重复追加。`,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        questionCount: {
          type: 'integer',
          minimum: 1,
          description: `本次要追加的训练题数量。用户未指定时填 ${PERSONALITY_CALIBRATION_ROUND_SIZE}；用户说 50/100 时按原数填写，不拆成 20 题多次派遣。`
        }
      }
    },
    execute: async (call) => {
      try {
        const rawQuestionCount = (call.args as Record<string, unknown>).questionCount
        const questionCount = rawQuestionCount === undefined
          ? PERSONALITY_CALIBRATION_ROUND_SIZE
          : Math.trunc(Number(rawQuestionCount))
        if (!Number.isSafeInteger(questionCount) || questionCount <= 0) {
          return invalidArgs('questionCount 必须是正整数；未指定时默认 20')
        }
        const snapshot = await context.provider.readSnapshot()
        const blocker = hasQuestionMutationBlocker(snapshot)
        if (blocker) return runtimeError(`现在不能追加训练题：${blocker}。请等任务结束后重读。`)
        const collection = await context.provider.readQuestions('training')
        if (!collection.questions.length) {
          return runtimeError('当前还没有训练题；请使用设问制卷入口并传 questionCount 生成首批，而不是调用追加工具。')
        }
        const calibration = summarizePersonalityAdaptiveCalibration({
          questionGroups: collection.questions,
          answers: collection.answers,
          promptSnapshot: snapshot.calibration ? { adaptiveCalibrationReviews: snapshot.calibration.reviews } : {}
        })
        const lastRound = calibration.rounds[calibration.rounds.length - 1]
        const denied = await requireWriteConfirmation(context, {
          title: `${PERSONALITY_QUESTION_BATCH_CONFIRM_TITLE_PREFIX}${questionCount} 道`,
          lines: [
            `当前题数：${collection.questions.length}`,
            `本次追加：${questionCount} 道，即第 ${collection.questions.length + 1}-${collection.questions.length + questionCount} 题`,
            `推荐每 ${PERSONALITY_CALIBRATION_ROUND_SIZE} 题做一次校准观察；本次派遣不要求题量是 20 的倍数，也不会替用户补写复盘。`,
            lastRound?.reviewed
              ? `最近完整观察窗（第 ${lastRound.questionStart}-${lastRound.questionEnd} 题）已有正式复盘，设问会继续吸收。`
              : '现有复盘是可选校准材料，不阻断本批生成。',
            '本次只启动一个设问任务，不会改写已有题目或复盘记录。'
          ]
        }, '追加人格训练题')
        if (denied) return denied

        const latestSnapshot = await context.provider.readSnapshot()
        const latestBlocker = hasQuestionMutationBlocker(latestSnapshot)
        if (latestBlocker) return runtimeError(`确认期间工作区状态已变化，不能追加训练题：${latestBlocker}。`)
        const latestCollection = await context.provider.readQuestions('training')
        if (
          latestCollection.resourceId !== collection.resourceId
          || latestCollection.questions.length !== collection.questions.length
        ) {
          return runtimeError('确认期间训练题已经变化，本次没有追加。')
        }
        const task = await context.provider.startQuestionBatch(questionCount)
        await context.provider.onChanged?.()
        return {
          content: `已派遣一个设问任务后台生成第 ${collection.questions.length + 1}-${collection.questions.length + questionCount} 题，共 ${questionCount} 道；当前 running，不代表题目已经全部落库。`,
          status: 'success',
          details: {
            fromQuestionCount: collection.questions.length,
            questionCount,
            targetQuestionCount: collection.questions.length + questionCount,
            task
          }
        }
      } catch (error) {
        return runtimeError(`追加人格训练题失败：${(error as Error).message}`)
      }
    }
  }
}

function createGenerateFrozenEvaluationTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'generatePersonalityFrozenEvaluation',
    longRunning: true,
    brief: '只在用户明确认为人格已经稳定后，依据最新角色性格正文和已完成轮次复盘生成 24 道冻结评测题。不会追加训练题；会先确认，已有评测集时将换代旧考卷。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reason: { type: 'string', maxLength: 200, description: '用户认为现在适合冻结评测考卷的简短理由。' }
      },
      required: ['reason']
    },
    execute: async (call) => {
      const reason = String((call.args as Record<string, unknown>).reason || '').replace(/\s+/g, ' ').trim()
      if (!reason) return invalidArgs('reason 不能为空')
      try {
        const snapshot = await context.provider.readSnapshot()
        const collection = await context.provider.readQuestions('training')
        const calibration = summarizePersonalityAdaptiveCalibration({
          questionGroups: collection.questions,
          answers: collection.answers,
          promptSnapshot: snapshot.calibration ? { adaptiveCalibrationReviews: snapshot.calibration.reviews } : {}
        })
        if (!calibration.rounds.length) return runtimeError('当前还没有人格校准训练题，不能生成冻结评测集。')
        const incomplete = calibration.rounds.filter((round) => !round.complete)
        if (incomplete.length) {
          return runtimeError(`还有轮次未全部人工确认：${incomplete.map((round) => `第 ${round.roundNumber} 轮 ${round.confirmedCount}/${round.questionCount}`).join('；')}。`)
        }
        const unreviewed = calibration.rounds.filter((round) => !round.reviewed)
        if (unreviewed.length) {
          return runtimeError(`还有轮次尚未由鉴心复盘：第 ${unreviewed.map((round) => round.roundNumber).join('、')} 轮。`)
        }
        const denied = await requireWriteConfirmation(context, {
          title: '确认生成冻结评测题',
          lines: [
            `角色：${snapshot.characterName || snapshot.characterId}`,
            `依据：最新角色性格正文 + ${calibration.reviews.length} 轮人工校准复盘`,
            `理由：${reason}`,
            '操作：只生成 24 道冻结评测题，不再追加训练题',
            ...(snapshot.evaluationSet ? ['当前已有生效评测集；新考卷成功落库后，旧考卷会退役。'] : []),
            '冻结考卷用于后续模型评测，不进入训练；生成后仍可先人工检查标准答案'
          ]
        }, '生成冻结评测题')
        if (denied) return denied
        const latest = await context.provider.readSnapshot()
        const latestCollection = await context.provider.readQuestions('training')
        const latestCalibration = summarizePersonalityAdaptiveCalibration({
          questionGroups: latestCollection.questions,
          answers: latestCollection.answers,
          promptSnapshot: latest.calibration ? { adaptiveCalibrationReviews: latest.calibration.reviews } : {}
        })
        if (
          latestCollection.resourceId !== collection.resourceId
          || latestCollection.questions.length !== collection.questions.length
          || latestCalibration.reviews.length !== calibration.reviews.length
          || latestCalibration.rounds.some((round) => !round.complete || !round.reviewed)
        ) {
          return runtimeError('确认期间问卷答案或复盘状态已经变化，本次没有生成冻结评测题。')
        }
        const task = await context.provider.startFrozenEvaluationGeneration(24)
        await context.provider.onChanged?.()
        return {
          content: '已启动 24 道冻结评测题的后台生成；当前 running，不代表考卷已经全部落库。',
          status: 'success',
          details: { questionCount: 24, task }
        }
      } catch (error) {
        return runtimeError(`生成冻结评测题失败：${(error as Error).message}`)
      }
    }
  }
}

function createStartGenerationTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'startPersonalityQuestionnaireGeneration',
    longRunning: true,
    brief: `派遣后台子 Agent「设问」执行正式问卷制卷。create_new 可用 questionCount 指定首批任意正整数题量，未填默认推荐 ${PERSONALITY_CALIBRATION_ROUND_SIZE}；restart_current 可指定重做后的总题数；resume 只从原目标的每 10 题 checkpoint 续跑，不改题量。后台成功/失败会作为【设问后台回报】写回当前会话。只负责派遣，running 不等于已交卷。`,
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        mode: { type: 'string', enum: ['create_new', 'resume', 'restart_current'] },
        questionCount: {
          type: 'integer',
          minimum: 1,
          description: `create_new 的首批题量，或 restart_current 重做后的总题数。可填 50、100 等任意正整数；create_new 未填默认 ${PERSONALITY_CALIBRATION_ROUND_SIZE}。resume 不得填写。`
        },
        correctionBrief: {
          type: 'string',
          description: '可选；上一份设问失败回报的定向纠错摘要：题号、违规规则、明确改写约束。首次出题通常不填。'
        }
      },
      required: ['mode']
    },
    execute: async (call) => {
      const mode = String((call.args as Record<string, unknown>).mode || '') as 'create_new' | 'resume' | 'restart_current'
      const correctionBrief = String((call.args as Record<string, unknown>).correctionBrief || '').trim()
      if (!['create_new', 'resume', 'restart_current'].includes(mode)) return invalidArgs('mode 不合法')
      const rawQuestionCount = (call.args as Record<string, unknown>).questionCount
      const hasExplicitQuestionCount = rawQuestionCount !== undefined
      const questionCount = hasExplicitQuestionCount
        ? Math.trunc(Number(rawQuestionCount))
        : mode === 'create_new'
          ? PERSONALITY_CALIBRATION_ROUND_SIZE
          : undefined
      if (hasExplicitQuestionCount && (!Number.isSafeInteger(questionCount) || Number(questionCount) <= 0)) {
        return invalidArgs('questionCount 必须是正整数')
      }
      if (mode === 'resume' && hasExplicitQuestionCount) {
        return invalidArgs('resume 只续跑原检查点目标，不能同时修改 questionCount；要追加新题请调用 startPersonalityQuestionBatch')
      }
      try {
        const snapshot = await context.provider.readSnapshot()
        const running = snapshot.backgroundTasks.find((task) => task.kind === 'questionnaire_generation' && task.status === 'running')
        if (running) return runtimeError(`问卷生成已经在运行：${running.progress?.label || running.taskId}`)
        const denied = await requireWriteConfirmation(context, {
          title: PERSONALITY_QUESTION_AUTHOR_DISPATCH_CONFIRM_TITLE,
          lines: [
            `模式：${mode}`,
            mode === 'create_new' ? '将新建训练数据集' : mode === 'resume' ? '将从已落库 checkpoint 续跑' : '将重做当前问卷，请确认旧草稿不再保留',
            questionCount
              ? `${mode === 'restart_current' ? '重做后总题数' : '首批题数'}：${questionCount}（推荐值是 ${PERSONALITY_CALIBRATION_ROUND_SIZE}，但不是硬限制）`
              : '题量：沿用当前问卷目标',
            correctionBrief ? `定向纠错：${clip(correctionBrief, 180)}` : '本次按正式协议生成；若质量门失败，设问会先自行有限纠错',
            '任务会在后台继续；停止鉴心或关闭弹窗不会取消，完成后会向当前会话发回报'
          ]
        }, '派遣设问后台制卷')
        if (denied) return denied
        const result = await context.provider.startQuestionnaireGeneration(mode, correctionBrief, questionCount)
        await context.provider.onChanged?.()
        return {
          content: `已派遣设问在后台制卷${questionCount ? `（${questionCount} 道）` : ''}；现在只是接单运行中，不代表已经交卷。你可以结束本轮，设问完成或失败后会向这个会话发送【设问后台回报】。`,
          status: 'success',
          details: { mode, questionCount, correctionBrief, workerAgentName: '设问', task: result }
        }
      } catch (error) {
        return runtimeError(`派遣设问后台制卷失败：${(error as Error).message}`)
      }
    }
  }
}

function createManageTrainingRunTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'managePersonalityTrainingRun',
    longRunning: true,
    brief: '管理人格训练：precheck 读取正式训练门槛；list/status/log 只读运行与日志；start 启动正式后台训练；cancel 取消明确 runId。start/cancel 会弹确认。',
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['precheck', 'list', 'status', 'log', 'start', 'cancel'] },
        runId: { type: 'string' },
        backend: { type: 'string', description: 'start 可选，缺省 local。' },
        allowExperimental: { type: 'boolean', description: '已答不足正式门槛但用户明确同意实验训练时设 true。' },
        datasetIds: { type: 'array', maxItems: 20, items: { type: 'string' } }
      },
      required: ['action']
    },
    execute: async (call) => {
      const args = call.args as Record<string, unknown>
      const action = String(args.action || '')
      const runId = String(args.runId || '').trim()
      try {
        if (action === 'precheck') {
          const precheck = await context.provider.precheckTraining()
          return { content: compactJson(precheck), status: 'success', details: { precheck } }
        }
        if (action === 'list') {
          const runs = await context.provider.listTrainingRuns()
          return { content: compactJson(runs), status: 'success', details: { runs } }
        }
        if (action === 'status') {
          if (!runId) return invalidArgs('status 需要 runId')
          const run = await context.provider.getTrainingRun(runId)
          return { content: compactJson(run), status: 'success', details: { run } }
        }
        if (action === 'log') {
          if (!runId) return invalidArgs('log 需要 runId')
          const log = await context.provider.getTrainingRunLog(runId)
          return { content: log.log || '日志为空', status: 'success', details: { runId: log.runId } }
        }
        if (action === 'start') {
          const precheck = await context.provider.precheckTraining()
          const allowExperimental = args.allowExperimental === true
          if (!precheck.canTrain && !allowExperimental) {
            return runtimeError(`训练预检未通过：${precheck.failureReason || compactJson(precheck.checks)}`)
          }
          const backend = String(args.backend || 'local').trim() || 'local'
          const datasetIds = Array.isArray(args.datasetIds) ? args.datasetIds.map((id) => String(id || '').trim()).filter(Boolean) : []
          const denied = await requireWriteConfirmation(context, {
            title: '确认启动人格模型训练',
            lines: [
              `训练后端：${backend}`,
              `数据集：${datasetIds.join('、') || '由服务端按当前正式数据决定'}`,
              ...(allowExperimental ? ['本次明确允许低于正式题量门槛的实验训练'] : []),
              '启动后可关闭弹窗，训练仍在后台运行'
            ]
          }, '启动人格模型训练')
          if (denied) return denied
          const run = await context.provider.startTraining({ backend, allowExperimental, ...(datasetIds.length ? { datasetIds } : {}) })
          await context.provider.onChanged?.()
          return {
            content: `已启动训练 runId=${run.runId}，当前状态 ${run.status}；尚未宣称训练完成。`,
            status: 'success', details: { run }
          }
        }
        if (action === 'cancel') {
          if (!runId) return invalidArgs('cancel 需要 runId')
          const denied = await requireWriteConfirmation(context, {
            title: '确认取消人格模型训练',
            lines: [`runId：${runId}`, '取消后本次运行不会产出可安装版本']
          }, '取消人格模型训练')
          if (denied) return denied
          const run = await context.provider.cancelTraining(runId)
          await context.provider.onChanged?.()
          return { content: `已请求取消训练 ${runId}，当前状态 ${run.status}。`, status: 'success', details: { run } }
        }
        return invalidArgs('action 不合法')
      } catch (error) {
        return runtimeError(`人格训练操作失败：${(error as Error).message}`)
      }
    }
  }
}

function createStartEvaluationTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'startPersonalityEvaluation',
    longRunning: true,
    brief: '用明确的模型 versionId 启动冻结评测集后台评测。只负责启动；完成后必须重新读取工作区指标，不能凭启动回执宣称通过。',
    schema: {
      type: 'object', additionalProperties: false,
      properties: { versionId: { type: 'string' } },
      required: ['versionId']
    },
    execute: async (call) => {
      const versionId = String((call.args as Record<string, unknown>).versionId || '').trim()
      if (!versionId) return invalidArgs('versionId 必填')
      try {
        const snapshot = await context.provider.readSnapshot()
        if (!snapshot.modelVersions.some((version) => version.versionId === versionId)) return invalidArgs(`找不到模型版本 ${versionId}`)
        const running = snapshot.backgroundTasks.find((task) => task.kind === 'evaluation' && task.status === 'running')
        if (running) return runtimeError(`评测已经在运行：${running.progress?.label || running.taskId}`)
        const denied = await requireWriteConfirmation(context, {
          title: '确认启动人格模型评测',
          lines: [`模型版本：${versionId}`, '评测会在后台继续，关闭弹窗不会取消']
        }, '启动人格模型评测')
        if (denied) return denied
        const result = await context.provider.startEvaluation(versionId)
        await context.provider.onChanged?.()
        return {
          content: `已启动版本 ${versionId} 的后台评测；当前尚未得出评测结论。`,
          status: 'success', details: { versionId, task: result }
        }
      } catch (error) {
        return runtimeError(`启动人格模型评测失败：${(error as Error).message}`)
      }
    }
  }
}

function createManageModelVersionTool(context: PersonalityTrainingAgentToolContext): ToolDefinition {
  return {
    name: 'managePersonalityModelVersion',
    longRunning: true,
    brief: '安装或删除明确人格模型版本。install 会改变角色当前使用版本；delete 是不可恢复删除。两种操作都先读取正式版本并弹确认。',
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['install', 'delete'] },
        versionId: { type: 'string' }
      },
      required: ['action', 'versionId']
    },
    execute: async (call) => {
      const args = call.args as Record<string, unknown>
      const action = String(args.action || '') as 'install' | 'delete'
      const versionId = String(args.versionId || '').trim()
      if (!['install', 'delete'].includes(action) || !versionId) return invalidArgs('action/versionId 不合法')
      try {
        const snapshot = await context.provider.readSnapshot()
        const version = snapshot.modelVersions.find((item) => item.versionId === versionId)
        if (!version) return invalidArgs(`找不到模型版本 ${versionId}`)
        const isInstalled = Boolean(version.installedAt) || version.status === 'installed'
        if (action === 'delete' && isInstalled) {
          return runtimeError('当前安装版本不能直接删除；请先安装或回退到另一个版本，再删除它。')
        }
        const denied = await requireWriteConfirmation(context, {
          title: action === 'install' ? '确认安装人格模型版本' : '确认删除人格模型版本',
          lines: action === 'install'
            ? [`versionId：${versionId}`, '安装后角色将使用这个人格模型版本']
            : [`versionId：${versionId}`, ...(isInstalled ? ['这是当前安装版本，删除会使角色失去该模型'] : []), '删除后不可恢复']
        }, action === 'install' ? '安装人格模型版本' : '删除人格模型版本')
        if (denied) return denied
        const result = action === 'install'
          ? await context.provider.installModelVersion(versionId)
          : await context.provider.deleteModelVersion(versionId)
        await context.provider.onChanged?.()
        return {
          content: action === 'install' ? `已安装模型版本 ${versionId}。` : `已删除模型版本 ${versionId}。`,
          status: 'success', details: { version: result }
        }
      } catch (error) {
        return runtimeError(`${action === 'install' ? '安装' : '删除'}人格模型版本失败：${(error as Error).message}`)
      }
    }
  }
}

export function createPersonalityTrainingAgentTools(context: PersonalityTrainingAgentToolContext): ToolDefinition[] {
  const runtimeContext: PersonalityTrainingAgentToolContext = context.questionHistoryReadState
    ? context
    : {
        ...context,
        questionHistoryReadState: { signature: '', fingerprint: '' }
      }
  return [
    createReadWorkspaceTool(runtimeContext),
    createReadQuestionsTool(runtimeContext),
    createReadQuestionHistoryTool(runtimeContext),
    createDeleteQuestionsTool(runtimeContext),
    createPatchQuestionsTool(runtimeContext),
    createSetAnswersTool(runtimeContext),
    createRewriteCharacterPersonalityTool(runtimeContext),
    createCompleteCalibrationRoundTool(runtimeContext),
    createStartQuestionBatchTool(runtimeContext),
    createGenerateFrozenEvaluationTool(runtimeContext),
    createStartGenerationTool(runtimeContext),
    createManageTrainingRunTool(runtimeContext),
    createStartEvaluationTool(runtimeContext),
    createManageModelVersionTool(runtimeContext)
  ]
}

/** 组件 provider 构造时复用的摘要 helper，避免 UI 和 Agent 各算一套答题数量。 */
export function summarizePersonalityQuestionCollection(input: {
  questions: PersonalityQuestionGroup[]
  answers: PersonalityAnswerMap
}) {
  let confirmedQuestions = 0
  let presetQuestions = 0
  for (const question of input.questions) {
    const state = answerState(question, input.answers)
    if (state === 'confirmed') confirmedQuestions += 1
    if (state === 'preset') presetQuestions += 1
  }
  const answeredQuestions = confirmedQuestions + presetQuestions
  return {
    totalQuestions: input.questions.length,
    answeredQuestions,
    skippedQuestions: 0,
    unansweredQuestions: Math.max(0, input.questions.length - answeredQuestions),
    confirmedQuestions,
    presetQuestions
  }
}

/** 仅用于 provider 类型收窄，确保正式 API 返回值结构不在组件里另造。 */
export type PersonalityTrainingAgentFormalRecords = {
  dataset: PersonalityTrainingDataset | null
  evaluationSet: PersonalityEvaluationSet | null
}
