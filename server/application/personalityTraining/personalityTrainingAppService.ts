import { characterRepository } from '../../repositories/characterRepository.js'
import { personalityTrainingRepository } from '../../repositories/personalityTrainingRepository.js'
import { removePersonalityModelPath, exportPersonalityModelZip } from '../../repositories/personalityModelStorage.js'
import { buildPersonalityQuestionnairePrompt } from './personalityQuestionnairePrompt.js'
import { buildTrainingExport } from './trainingDataExport.js'
import { buildColabTrainingPackage } from './colabPackageService.js'
import { createChatSampleDraft, listChatMessageCandidates } from './chatSampleService.js'
import {
  cancelLocalTrainingRun,
  readTrainingRunLog,
  runLocalPrecheck,
  startLocalTrainingPipeline
} from './localTrainingService.js'
import { savePersonalityModelZip } from '../../repositories/personalityModelStorage.js'

type Row = Record<string, any>

const MIN_FORMAL_TRAINING_GROUPS = 60
const VALID_RATIO = 0.1
type DimensionQuestionKind = 'training' | 'evaluation'

function text(value: unknown, fallback = '') {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function arrayValue(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : []
}

function normalizeAnswerMap(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function retainAnswersForQuestions(answers: Record<string, any>, questions: Row[]) {
  const validQuestionIds = new Set(questions.map((question) => text(question.id).trim()).filter(Boolean))
  return Object.fromEntries(
    Object.entries(answers).filter(([questionId]) => validQuestionIds.has(String(questionId || '').trim()))
  )
}

// 导出文件名清洗：保留中文与常见字符，剔除文件系统非法字符，避免下载失败。
function safeExportFileNameSegment(value: string, fallback: string) {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|\u0000-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return cleaned || fallback
}

function positiveInteger(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? Math.trunc(next) : 0
}

function normalizeDimensionPlanItem(value: unknown) {
  const item = value && typeof value === 'object' ? value as Row : {}
  const id = text(item.id || item.dimensionId || item.dimension_id).trim()
  const name = text(item.name || item.dimension || item.label || id).trim()
  if (!id && !name) return null
  return {
    id,
    name: name || id,
    targetTrainingCount: positiveInteger(item.targetTrainingCount ?? item.target_training_count ?? item.trainingCount ?? item.training_count),
    targetEvaluationCount: positiveInteger(item.targetEvaluationCount ?? item.target_evaluation_count ?? item.evaluationCount ?? item.evaluation_count)
  }
}

function normalizeDimensionPlanItems(value: unknown) {
  return arrayValue(value).map((item) => normalizeDimensionPlanItem(item)).filter(Boolean) as Array<{
    id: string
    name: string
    targetTrainingCount: number
    targetEvaluationCount: number
  }>
}

function plannedDimensionForIndex(dimensionPlan: unknown, absoluteIndex: number, kind: DimensionQuestionKind) {
  const plan = normalizeDimensionPlanItems(dimensionPlan)
  if (!plan.length) return ''
  const targetKey = kind === 'evaluation' ? 'targetEvaluationCount' : 'targetTrainingCount'
  let cursor = 0
  for (const item of plan) {
    cursor += Number(item[targetKey]) || 0
    if (cursor > 0 && absoluteIndex <= cursor) return item.name
  }
  return plan[(Math.max(1, absoluteIndex) - 1) % plan.length]?.name || ''
}

function normalizeDimension(value: unknown, dimensionPlan: unknown, absoluteIndex: number, kind: DimensionQuestionKind) {
  const raw = text(value).trim()
  const plan = normalizeDimensionPlanItems(dimensionPlan)
  if (raw) {
    const matched = plan.find((item) => item.id === raw || item.name === raw)
    return matched?.name || raw
  }
  return plannedDimensionForIndex(dimensionPlan, absoluteIndex, kind)
}

function normalizeQuestionGroups(value: unknown, dimensionPlan: unknown = []) {
  return arrayValue(value).map((item, index) => {
    const id = text(item.id || item.groupId || item.group_id || `group_${index + 1}`)
    const candidates = arrayValue(item.candidates).map((candidate, candidateIndex) => ({
      id: text(candidate.id || candidate.candidateId || candidate.candidate_id || `${id}_choice_${candidateIndex + 1}`),
      text: text(candidate.text || candidate.plan || candidate.content || candidate.label),
      label: text(candidate.label || candidate.id || `${candidateIndex + 1}`)
    }))
    const presetAnswerId = text(item.presetAnswerId || item.preset_answer_id || item.suggestedAnswerId || item.suggested_answer_id).trim()
    const scenarioType = text(item.scenarioType || item.scenario_type).trim()
    const pressureLevel = text(item.pressureLevel || item.pressure_level).trim()
    const diversityNote = text(item.diversityNote || item.diversity_note).trim()
    return {
      id,
      question: text(item.question),
      dimension: normalizeDimension(item.dimension, dimensionPlan, index + 1, 'training'),
      difficulty: text(item.difficulty || 'standard'),
      candidates,
      ...(presetAnswerId && candidates.some((candidate) => candidate.id === presetAnswerId) ? { presetAnswerId } : {}),
      ...(scenarioType ? { scenarioType } : {}),
      ...(['low', 'medium', 'high'].includes(pressureLevel) ? { pressureLevel } : {}),
      ...(diversityNote ? { diversityNote } : {}),
      sourceHints: arrayValue(item.sourceHints || item.source_hints).map((hint) => text(hint)).filter(Boolean)
    }
  }).filter((item) => item.question && item.candidates.length >= 2)
}

function normalizeEvaluationQuestions(value: unknown, dimensionPlan: unknown = []) {
  return arrayValue(value).map((item, index) => {
    const id = text(item.id || item.evalId || item.eval_id || `eval_${index + 1}`)
    const candidates = arrayValue(item.candidates).map((candidate, candidateIndex) => ({
      id: text(candidate.id || candidate.candidateId || candidate.candidate_id || `eval_${index + 1}_choice_${candidateIndex + 1}`),
      text: text(candidate.text || candidate.plan || candidate.content || candidate.label),
      label: text(candidate.label || candidate.id || `${candidateIndex + 1}`)
    }))
    const presetAnswerId = text(item.presetAnswerId || item.preset_answer_id || item.suggestedAnswerId || item.suggested_answer_id).trim()
    const scenarioType = text(item.scenarioType || item.scenario_type).trim()
    const pressureLevel = text(item.pressureLevel || item.pressure_level).trim()
    const diversityNote = text(item.diversityNote || item.diversity_note).trim()
    return {
      id,
      question: text(item.question),
      dimension: normalizeDimension(item.dimension, dimensionPlan, index + 1, 'evaluation'),
      difficulty: text(item.difficulty || 'standard'),
      candidates,
      ...(presetAnswerId && candidates.some((candidate) => candidate.id === presetAnswerId) ? { presetAnswerId } : {}),
      ...(scenarioType ? { scenarioType } : {}),
      ...(['low', 'medium', 'high'].includes(pressureLevel) ? { pressureLevel } : {}),
      ...(diversityNote ? { diversityNote } : {}),
      sourceHints: arrayValue(item.sourceHints || item.source_hints).map((hint) => text(hint)).filter(Boolean)
    }
  }).filter((item) => item.question && item.candidates.length >= 2)
}

function answerForGroup(answers: Record<string, any>, groupId: string) {
  const raw = answers[groupId]
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'string') return { candidateId: raw, reviewState: 'confirmed' }
  if (typeof raw === 'object') return raw as Row
  return null
}

function buildSplitManifest(questionGroups: Row[], answers: Record<string, any>) {
  const resolved = questionGroups
    .map((group) => {
      const answer = answerForGroup(answers, text(group.id))
      const explicitCandidateId = text(answer?.candidateId ?? answer?.candidate_id ?? answer?.answerId ?? answer?.answer_id)
      const reviewState = text(answer?.reviewState ?? answer?.review_state ?? 'confirmed')
      const skipped = answer?.skipped === true || reviewState === 'skipped'
      const candidateIds = arrayValue(group.candidates).map((candidate) => text(candidate.id)).filter(Boolean)
      const hasExplicit = Boolean(explicitCandidateId) && !skipped && reviewState !== 'rejected' && candidateIds.includes(explicitCandidateId)
      const presetCandidateId = text(group.presetAnswerId ?? group.preset_answer_id)
      const candidateId = hasExplicit
        ? explicitCandidateId
        : (candidateIds.includes(presetCandidateId) ? presetCandidateId : '')
      if (!candidateId) return null
      return {
        groupId: text(group.id),
        answerCandidateId: candidateId,
        answerSource: hasExplicit ? 'confirmed' : 'preset',
        candidateIds,
        dimension: text(group.dimension),
        difficulty: text(group.difficulty || 'standard')
      }
    })
    .filter(Boolean) as Row[]

  const validCount = resolved.length >= 10
    ? Math.max(1, Math.round(resolved.length * VALID_RATIO))
    : 0
  const trainCount = Math.max(0, resolved.length - validCount)
  const trainGroupIds = resolved.slice(0, trainCount).map((item) => item.groupId)
  const validGroupIds = resolved.slice(trainCount).map((item) => item.groupId)
  const userConfirmedGroupCount = resolved.filter((item) => item.answerSource === 'confirmed').length
  const presetGroupCount = resolved.filter((item) => item.answerSource === 'preset').length
  return {
    schemaVersion: 1,
    minimumFormalTrainingGroups: MIN_FORMAL_TRAINING_GROUPS,
    confirmedGroupCount: resolved.length,
    userConfirmedGroupCount,
    presetGroupCount,
    unresolvedGroupCount: questionGroups.length - resolved.length,
    skippedGroupCount: questionGroups.length - resolved.length,
    trainGroupIds,
    validGroupIds,
    evaluationPolicy: 'personality_evaluation_sets_only',
    trainingExamples: resolved.map((item) => ({
      groupId: item.groupId,
      answerCandidateId: item.answerCandidateId,
      answerSource: item.answerSource,
      candidateIds: item.candidateIds
    }))
  }
}

export function createPersonalityTrainingAppService(
  repository = personalityTrainingRepository,
  characters = characterRepository
) {
  function requireCharacter(characterId: string) {
    const normalizedId = text(characterId).trim()
    if (!normalizedId) throw new Error('缺少角色 ID')
    const character = characters.getCharacterById(normalizedId)
    if (!character) throw new Error('角色不存在')
    return { characterId: normalizedId, character }
  }

  function ensureCurrentModelVersion(characterId: string) {
    const { character } = requireCharacter(characterId)
    const modelPath = text(character.personalityModelPath ?? character.personality_model_path).trim()
    return repository.ensureInstalledVersionForCurrentPath(characterId, modelPath)
  }

  // 训练前共用准备：解析数据集、导出按组切分的训练包、套用 60 组实验模型门槛
  function prepareTrainingExport(characterId: string, payload: Row) {
    const requestedDatasetIds = arrayValue(payload.datasetIds).map((value) => text(value)).filter(Boolean)
    const allDatasets = repository.listDatasets(characterId)
    const datasets = requestedDatasetIds.length
      ? allDatasets.filter((dataset: Row) => requestedDatasetIds.includes(text(dataset.datasetId)))
      : allDatasets
    if (!datasets.length) throw new Error('没有可用于训练的数据集')

    const exportResult = buildTrainingExport(datasets)
    const confirmedGroups = exportResult.stats.trainGroups + exportResult.stats.validGroups
    if (!confirmedGroups) throw new Error('没有有效样本组，请先补全人工答案或预设答案')
    const experimental = confirmedGroups < MIN_FORMAL_TRAINING_GROUPS
    if (experimental && payload.allowExperimental !== true) {
      throw new Error(`有效样本 ${confirmedGroups} 组，少于 ${MIN_FORMAL_TRAINING_GROUPS} 组只能训练实验模型；请确认后重试`)
    }
    // 合并重训：来源标记取数据集主来源；问卷与聊天投影混合时仍记问卷（第 6 批接入会话样本后再细分）
    const sourceKind = datasets.every((dataset: Row) => text(dataset.sourceKind) === text(datasets[0].sourceKind))
      ? text(datasets[0].sourceKind, 'questionnaire')
      : 'questionnaire'
    return { datasets, exportResult, experimental, sourceKind }
  }

  return {
    ensureCurrentModelVersion,

    listModelVersions(characterId: string) {
      ensureCurrentModelVersion(characterId)
      return repository.listModelVersions(characterId)
    },

    installModelVersion(characterId: string, versionId: string) {
      requireCharacter(characterId)
      const version = repository.getModelVersion(characterId, versionId)
      if (!version) throw new Error('模型版本不存在')
      if (text(version.status) === 'archived') throw new Error('已归档的模型版本不能安装')
      // 实验模型（少于正式题量训练）不允许装配到正式回复链路
      if ((version.metrics as Row | undefined)?.experimental === true) {
        throw new Error('实验模型（不足 60 题训练）不能安装到正式回复链路，请补足题量后重新训练')
      }
      characters.updateCharacterPersonalityModelPath(characterId, text(version.modelPath))
      return repository.markModelVersionInstalled(characterId, versionId)
    },

    // 评测指标写回（第 7 批）：指标必须带 evaluationSetId（跨考卷指标不可直接对比的前提）
    saveModelVersionMetrics(characterId: string, versionId: string, payload: Row = {}) {
      requireCharacter(characterId)
      const version = repository.getModelVersion(characterId, versionId)
      if (!version) throw new Error('模型版本不存在')
      const metrics = (payload.metrics && typeof payload.metrics === 'object' ? payload.metrics : {}) as Row
      const evaluationSetId = text(metrics.evaluationSetId).trim()
      if (!evaluationSetId) throw new Error('评测指标必须记录所用评测集（evaluationSetId）')
      const evaluationSet = repository.getEvaluationSet(characterId, evaluationSetId)
      if (!evaluationSet) throw new Error('指标引用的评测集不存在')
      const currentStatus = text(version.status)
      const nextStatus = currentStatus === 'trained' || currentStatus === 'ready' ? 'evaluated' : currentStatus
      return repository.updateModelVersionMetrics(characterId, versionId, metrics, nextStatus)
    },

    deleteModelVersion(characterId: string, versionId: string) {
      const { character } = requireCharacter(characterId)
      const version = repository.getModelVersion(characterId, versionId)
      if (!version) throw new Error('模型版本不存在')
      const currentPath = text(character.personalityModelPath ?? character.personality_model_path).trim()
      if (currentPath && currentPath === text(version.modelPath).trim()) {
        throw new Error('当前安装中的模型版本不能删除，请先安装其他版本或删除当前模型')
      }
      removePersonalityModelPath(text(version.modelPath))
      return repository.archiveModelVersion(characterId, versionId, 'deleted_uninstalled_version')
    },

    // 导出模型版本为可直接导入其它角色的 ONNX zip；文件名 = 角色名-版本名
    exportModelVersion(characterId: string, versionId: string, versionLabel = '') {
      const { character } = requireCharacter(characterId)
      const version = repository.getModelVersion(characterId, versionId)
      if (!version) throw new Error('模型版本不存在')
      if (text(version.status) === 'archived') throw new Error('已归档的模型版本文件已删除，无法导出')
      const modelPath = text(version.modelPath).trim()
      if (!modelPath) throw new Error('该版本没有模型文件，无法导出')
      const built = exportPersonalityModelZip(modelPath)
      if (!built.ok) throw new Error(built.error)
      const namePart = safeExportFileNameSegment(text(character.name), '角色')
      const labelPart = safeExportFileNameSegment(versionLabel || versionId, versionId)
      return {
        zipBuffer: built.buffer,
        fileName: `${namePart}-${labelPart}.zip`,
        sizeBytes: built.sizeBytes,
        fileCount: built.fileCount
      }
    },

    // 导入模型包 zip：校验结构后存为新版本（不自动安装、不动当前装配指针），用于角色间模型迁移
    importModelVersion(characterId: string, buffer: Buffer, originalFilename?: string) {
      const { characterId: normalizedId } = requireCharacter(characterId)
      const versionId = repository.createId('pmv')
      const saved = savePersonalityModelZip({ characterId: normalizedId, versionId, buffer, originalFilename })
      if (!saved.ok) throw new Error(saved.error)
      return repository.createModelVersion({
        versionId,
        characterId: normalizedId,
        modelPath: saved.storedPath,
        status: 'trained',
        sourceKind: 'manual_upload',
        trainingBackend: 'manual_upload',
        metrics: {
          importedFrom: 'model_package_upload',
          originalFilename: text(originalFilename),
          sizeBytes: saved.sizeBytes,
          fileCount: saved.fileCount
        }
      })
    },

    createDatasetDraft(characterId: string, payload: Row = {}) {
      const { characterId: normalizedId, character } = requireCharacter(characterId)
      const promptSnapshot = buildPersonalityQuestionnairePrompt({
        character,
        targetTrainingGroupCount: Number(payload.targetTrainingGroupCount || 20),
        targetEvaluationQuestionCount: Number(payload.targetEvaluationQuestionCount ?? 0)
      })
      const sourceSummary = {
        characterId: normalizedId,
        characterName: text(character.name),
        sourceFields: ['desc', 'appearance', 'personality', 'speakingStyle', 'experience', 'worldview', 'background'],
        createdBy: 'server_prompt_blueprint'
      }
      return repository.createDatasetDraft({
        characterId: normalizedId,
        title: text(payload.title || `${text(character.name, '角色')} 人格模型问卷草稿`),
        sourceKind: text(payload.sourceKind || payload.source_kind || 'questionnaire'),
        sourceSummary,
        promptSnapshot,
        dimensionPlan: payload.dimensionPlan || []
      })
    },

    saveDatasetQuestionnaire(characterId: string, datasetId: string, payload: Row = {}) {
      requireCharacter(characterId)
      const dataset = repository.getDataset(characterId, datasetId)
      if (!dataset) throw new Error('训练数据集不存在')
      const dimensionPlan = arrayValue(payload.dimensionPlan ?? payload.dimension_plan)
      const questionGroups = normalizeQuestionGroups(payload.questionGroups ?? payload.question_groups, dimensionPlan)
      const evaluationQuestions = normalizeEvaluationQuestions(payload.evaluationQuestions ?? payload.evaluation_questions, dimensionPlan)
      const promptSnapshot = payload.promptSnapshot || payload.prompt_snapshot || dataset.promptSnapshot || {}
      const sourceSummary = payload.sourceSummary || payload.source_summary || dataset.sourceSummary || {}
      const generationCheckpoint = promptSnapshot && typeof promptSnapshot === 'object'
        ? (promptSnapshot as Row).questionnaireGenerationCheckpoint
        : null
      const questionnaireGenerating = generationCheckpoint && typeof generationCheckpoint === 'object'
        && text((generationCheckpoint as Row).status) === 'in_progress'
      const answers = retainAnswersForQuestions(
        normalizeAnswerMap(dataset.answers || dataset.answersJson || {}),
        questionGroups
      )
      const splitManifest = buildSplitManifest(questionGroups, answers)
      const status = questionnaireGenerating
        ? 'questionnaire_generating'
        : (splitManifest.confirmedGroupCount >= MIN_FORMAL_TRAINING_GROUPS ? 'ready' : 'draft')
      const updated = repository.updateDatasetQuestionnaire({
        characterId,
        datasetId,
        dimensionPlan,
        questionGroups,
        answers,
        splitManifest,
        sourceSummary,
        promptSnapshot,
        status
      })
      if (evaluationQuestions.length) {
        repository.retireActiveEvaluationSets(characterId, `dataset:${datasetId}:replace`)
        repository.createEvaluationSet({
          characterId,
          datasetId,
          questions: evaluationQuestions,
          answers: {}
        })
      }
      return updated
    },

    saveDatasetAnswers(characterId: string, datasetId: string, payload: Row = {}) {
      requireCharacter(characterId)
      const dataset = repository.getDataset(characterId, datasetId)
      if (!dataset) throw new Error('训练数据集不存在')
      const answers = normalizeAnswerMap(payload.answers)
      const existingAnswers = normalizeAnswerMap(dataset.answers || dataset.answersJson || {})
      if (
        Object.keys(existingAnswers).length > 0
        && Object.keys(answers).length === 0
        && payload.allowClearConfirmed !== true
      ) {
        throw new Error('拒绝清空人格问卷人工答案：只有明确整卷重做并携带 allowClearConfirmed 才允许清空')
      }
      const questionGroups = normalizeQuestionGroups(dataset.questionGroups || dataset.questionGroupsJson || [], dataset.dimensionPlan || dataset.dimensionPlanJson || [])
      const splitManifest = buildSplitManifest(questionGroups, answers)
      const status = splitManifest.confirmedGroupCount >= MIN_FORMAL_TRAINING_GROUPS ? 'ready' : 'draft'
      return repository.updateDatasetAnswers({
        characterId,
        datasetId,
        answers,
        splitManifest,
        status
      })
    },

    listDatasets(characterId: string) {
      requireCharacter(characterId)
      return repository.listDatasets(characterId)
    },

    listEvaluationSets(characterId: string) {
      requireCharacter(characterId)
      return repository.listEvaluationSets(characterId)
    },

    saveEvaluationAnswers(characterId: string, evalSetId: string, payload: Row = {}) {
      requireCharacter(characterId)
      const evaluationSet = repository.getEvaluationSet(characterId, evalSetId)
      if (!evaluationSet) throw new Error('评测集不存在')
      if (text(evaluationSet.status) !== 'active') throw new Error('只能填写 active 状态的评测集')
      return repository.updateEvaluationAnswers({
        characterId,
        evalSetId,
        answers: normalizeAnswerMap(payload.answers),
        metrics: payload.metrics || {}
      })
    },

    // 编辑冻结评测题题面（情境/候选文本）：保持 candidateId 不变，已作答记录与 evalSetId 不动。
    // 注意：改题后旧版本指标与新题面不再一致，需重新运行评测刷新。
    saveEvaluationQuestions(characterId: string, evalSetId: string, payload: Row = {}) {
      requireCharacter(characterId)
      const evaluationSet = repository.getEvaluationSet(characterId, evalSetId)
      if (!evaluationSet) throw new Error('评测集不存在')
      if (text(evaluationSet.status) !== 'active') throw new Error('只能修改 active 状态的评测集')
      const dimensionPlan = (evaluationSet.dimensionPlan || evaluationSet.dimensionPlanJson || []) as unknown
      const questions = normalizeEvaluationQuestions(payload.questions, dimensionPlan)
      const answers = retainAnswersForQuestions(
        normalizeAnswerMap(evaluationSet.answers || evaluationSet.answersJson || {}),
        questions
      )
      return repository.updateEvaluationQuestions({
        characterId,
        evalSetId,
        questions,
        answers
      })
    },

    // ---------- 训练任务（第 4 批：本机训练链路） ----------

    precheckLocalTraining(characterId: string) {
      requireCharacter(characterId)
      return runLocalPrecheck()
    },

    listTrainingRuns(characterId: string) {
      requireCharacter(characterId)
      return repository.listTrainingRuns(characterId)
    },

    getTrainingRun(characterId: string, runId: string) {
      requireCharacter(characterId)
      const run = repository.getTrainingRun(characterId, runId)
      if (!run) throw new Error('训练任务不存在')
      return run
    },

    getTrainingRunLog(characterId: string, runId: string) {
      requireCharacter(characterId)
      const run = repository.getTrainingRun(characterId, runId)
      if (!run) throw new Error('训练任务不存在')
      return { runId, log: readTrainingRunLog(text(run.logPath)) }
    },

    cancelTrainingRun(characterId: string, runId: string) {
      requireCharacter(characterId)
      const run = repository.getTrainingRun(characterId, runId)
      if (!run) throw new Error('训练任务不存在')
      const status = text(run.status)
      if (!['pending', 'preparing', 'running', 'importing', 'awaiting_import'].includes(status)) {
        throw new Error('训练任务已结束，无法取消')
      }
      const cancelled = status === 'awaiting_import' ? false : cancelLocalTrainingRun(runId)
      if (!cancelled) {
        // 进程句柄不在（例如服务重启后残留），直接落库为失败，保证不悬空
        return repository.updateTrainingRun({
          characterId,
          runId,
          status: 'failed',
          failureStage: 'cancelled',
          failureReason: '用户取消了训练'
        })
      }
      return repository.getTrainingRun(characterId, runId)
    },

    startTrainingRun(characterId: string, payload: Row = {}) {
      const { characterId: normalizedId } = requireCharacter(characterId)
      const backend = text(payload.backend || 'local')
      if (backend !== 'local') throw new Error(`暂不支持的训练后端：${backend}`)

      const activeRun = repository.listTrainingRuns(normalizedId)
        .find((run: Row) => ['pending', 'preparing', 'running', 'importing'].includes(text(run.status)))
      if (activeRun) throw new Error('该角色已有训练任务进行中，请先等待完成或取消')

      const prepared = prepareTrainingExport(normalizedId, payload)
      const installedVersion = repository.listModelVersions(normalizedId)
        .find((version: Row) => text(version.status) === 'installed')

      const run = repository.createTrainingRun({
        characterId: normalizedId,
        backend: 'local',
        status: 'pending',
        datasetIds: prepared.exportResult.stats.datasetIds,
        metrics: { stats: prepared.exportResult.stats, experimental: prepared.experimental }
      })
      if (!run) throw new Error('创建训练任务失败')

      startLocalTrainingPipeline({
        characterId: normalizedId,
        run,
        exportResult: prepared.exportResult,
        parentVersionId: text(installedVersion?.versionId),
        sourceKind: prepared.sourceKind
      })
      return run
    },

    // ---------- 聊天记录持续优化（第 6 批） ----------

    listChatMessageCandidates(characterId: string, payload: Row = {}) {
      const { characterId: normalizedId, character } = requireCharacter(characterId)
      return listChatMessageCandidates({
        characterId: normalizedId,
        characterName: text(character.name, '角色'),
        sessionId: text(payload.sessionId)
      })
    },

    createChatSampleDraft(characterId: string, payload: Row = {}) {
      const { characterId: normalizedId, character } = requireCharacter(characterId)
      return createChatSampleDraft({
        characterId: normalizedId,
        character: character as Row,
        selections: Array.isArray(payload.selections) ? payload.selections : []
      })
    },

    // ---------- Colab 手动后端（第 5 批） ----------

    exportColabTrainingPackage(characterId: string, payload: Row = {}) {
      const { characterId: normalizedId, character } = requireCharacter(characterId)
      const prepared = prepareTrainingExport(normalizedId, payload)
      const run = repository.createTrainingRun({
        characterId: normalizedId,
        backend: 'colab_notebook',
        status: 'awaiting_import',
        datasetIds: prepared.exportResult.stats.datasetIds,
        metrics: {
          stats: prepared.exportResult.stats,
          experimental: prepared.experimental,
          sourceKind: prepared.sourceKind,
          progressStage: 'awaiting_import',
          progressMessage: '训练包已导出，等待从 Colab 带模型 zip 回来导入'
        }
      })
      if (!run) throw new Error('创建训练任务失败')
      const pack = buildColabTrainingPackage({
        characterName: text(character.name, '角色'),
        runId: text(run.runId),
        exportResult: prepared.exportResult
      })
      return { run, ...pack }
    },

    importTrainingRunArtifact(characterId: string, runId: string, buffer: Buffer, originalFilename?: string) {
      const { characterId: normalizedId } = requireCharacter(characterId)
      const run = repository.getTrainingRun(normalizedId, runId)
      if (!run) throw new Error('训练任务不存在')
      const status = text(run.status)
      if (status !== 'awaiting_import' && status !== 'failed') {
        throw new Error('该训练任务当前不接受导入')
      }
      const runMetrics = (run.metrics && typeof run.metrics === 'object' ? run.metrics : {}) as Row

      repository.updateTrainingRun({ characterId: normalizedId, runId, status: 'importing' })
      const versionId = repository.createId('pmv')
      const saved = savePersonalityModelZip({
        characterId: normalizedId,
        versionId,
        buffer,
        originalFilename: text(originalFilename, `${runId}.zip`)
      })
      if (!saved.ok) {
        repository.updateTrainingRun({
          characterId: normalizedId,
          runId,
          status: 'failed',
          failureStage: 'import_validation',
          failureReason: saved.error
        })
        throw new Error(saved.error)
      }
      const installedVersion = repository.listModelVersions(normalizedId)
        .find((version: Row) => text(version.status) === 'installed')
      repository.createModelVersion({
        versionId,
        characterId: normalizedId,
        parentVersionId: text(installedVersion?.versionId),
        modelPath: saved.storedPath,
        status: 'trained',
        sourceKind: text(runMetrics.sourceKind, 'questionnaire'),
        sourceDatasetIds: run.datasetIds || [],
        trainingBackend: 'colab_notebook',
        metrics: {
          experimental: runMetrics.experimental === true,
          sourceRunId: runId,
          stats: runMetrics.stats || {}
        }
      })
      return repository.updateTrainingRun({
        characterId: normalizedId,
        runId,
        status: 'succeeded',
        failureStage: '',
        failureReason: '',
        outputVersionId: versionId,
        metrics: {
          ...runMetrics,
          progressStage: 'succeeded',
          progressMessage: '已导入 Colab 训练产物，生成新版本（未安装）'
        }
      })
    }
  }
}



export const personalityTrainingAppService = createPersonalityTrainingAppService()
