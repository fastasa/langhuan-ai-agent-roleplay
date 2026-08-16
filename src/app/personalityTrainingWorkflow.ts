import type { AgentModelConfig } from '../types'
import { API } from '../config/api'
import { buildTaskModelAiOptions } from '../utils/modelTaskTiers'
import type { PersonalityCalibrationSample } from './personalityCalibration'
import {
  DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS,
  PERSONALITY_CALIBRATION_ROUND_SIZE,
  PERSONALITY_CALIBRATION_STOP_WINDOW_ROUNDS,
  PERSONALITY_CALIBRATION_TARGET_PRESET_HIT_RATE,
  PERSONALITY_SIMPLE_CANDIDATE_MAX_LENGTH,
  PERSONALITY_SIMPLE_QUESTION_MAX_LENGTH,
  buildDefaultPersonalityQuestionnaireDimensionPlan,
  renderPersonalityQuestionnaireBatchProtocol,
  resolvePersonalityQuestionComplexity,
  resolvePersonalityQuestionPressureLevel,
  type PersonalityQuestionPressureLevel
} from '../../shared/personalityQuestionnaireDesign'

// 人格模型训练工作流（前端客户端层）：
// 只消费第 1-2 批已冻结的服务端真值（版本台账 / 训练数据集 / 冻结评测集），
// 不在前端另造业务字段；展示用派生值（如版本序号）一律视图层计算，不回写。

export type PersonalityQuestionCandidate = {
  id: string
  text: string
  label: string
}

export type PersonalityQuestionGroup = {
  id: string
  question: string
  dimension: string
  difficulty: string
  candidates: PersonalityQuestionCandidate[]
  /** Agent 预设的最贴合角色回答；用户未人工改选时，它就是正式默认答案。 */
  presetAnswerId?: string
  /** 具体事件机制，用于跨整卷比较情境类型；不是九维名称。 */
  scenarioType?: string
  /** 处境压力程度，与 simple/complex 题面复杂度分离。 */
  pressureLevel?: PersonalityQuestionPressureLevel
  /** 相对最接近旧题的实质差异说明，供设问、鉴心和质量门审计。 */
  diversityNote?: string
  sourceHints?: string[]
}

export type PersonalityAnswerEntry = {
  candidateId?: string
  reviewState?: string
  skipped?: boolean
}

export type PersonalityAnswerMap = Record<string, PersonalityAnswerEntry>

export type PersonalityCalibrationRoundAssessment = 'richer' | 'possible_conflict' | 'mixed' | 'stable'

export type PersonalityCalibrationRoundReview = {
  roundNumber: number
  questionStart: number
  questionEnd: number
  confirmedCount: number
  presetHitCount: number
  presetHitRate: number
  assessment: PersonalityCalibrationRoundAssessment
  summary: string
  stableTraits: string[]
  contextualTraits: string[]
  possibleContradictions: string[]
  reviewedAt: string
}

export type PersonalityCalibrationRoundStats = {
  roundNumber: number
  questionStart: number
  questionEnd: number
  questionCount: number
  confirmedCount: number
  presetHitCount: number
  correctionCount: number
  presetHitRate: number | null
  complete: boolean
  reviewed: boolean
}

export type PersonalityAdaptiveCalibrationSummary = {
  roundSize: number
  rounds: PersonalityCalibrationRoundStats[]
  reviews: PersonalityCalibrationRoundReview[]
  nextReviewRoundNumber: number
  canReviewNextRound: boolean
  rollingPresetHitRate: number | null
  targetPresetHitRate: number
  targetWindowRounds: number
  canSuggestStop: boolean
}

export type PersonalitySplitManifest = {
  schemaVersion?: number
  minimumFormalTrainingGroups?: number
  confirmedGroupCount?: number
  userConfirmedGroupCount?: number
  presetGroupCount?: number
  unresolvedGroupCount?: number
  skippedGroupCount?: number
  trainGroupIds?: string[]
  validGroupIds?: string[]
  evaluationPolicy?: string
}

export type PersonalityTrainingDataset = {
  datasetId: string
  characterId: string
  title: string
  sourceKind: string
  status: string
  sourceSummary?: Record<string, unknown>
  promptSnapshot?: Record<string, unknown>
  dimensionPlan?: unknown[]
  questionGroups?: PersonalityQuestionGroup[]
  answers?: PersonalityAnswerMap
  splitManifest?: PersonalitySplitManifest
  createdAt?: string
  updatedAt?: string
}

export type PersonalityModelVersion = {
  versionId: string
  characterId: string
  parentVersionId?: string
  modelPath: string
  status: string
  sourceKind: string
  sourceDatasetIds?: string[]
  trainingBackend?: string
  metrics?: Record<string, unknown>
  createdAt?: string
  installedAt?: string
  archivedAt?: string
}

export type PersonalityEvaluationSet = {
  evalSetId: string
  characterId: string
  datasetId?: string
  status: string
  questions?: PersonalityQuestionGroup[]
  answers?: PersonalityAnswerMap
  metrics?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
  retiredAt?: string
  retireReason?: string
}

export type PersonalityPrecheckCheckRow = {
  id: string
  name: string
  state: 'ok' | 'fail' | 'skip' | 'warn'
  detail: string
}

export type PersonalityPrecheckResult = {
  ok: boolean
  canTrain: boolean
  failureStage: string
  failureReason: string
  checks: PersonalityPrecheckCheckRow[]
}

export type PersonalityChatMessageCandidate = {
  sessionId: string
  sessionTitle: string
  messageId: number
  time: string
  role: string
  speakerName: string
  text: string
  projection: {
    state: 'ok' | 'none' | 'fail' | 'running' | 'hidden'
    failureReason: string
  }
}

export type PersonalityChatMessageList = {
  sessions: Array<{ sessionId: string; title: string; updatedAt: string }>
  messages: PersonalityChatMessageCandidate[]
  truncated: boolean
}

export type PersonalityChatSampleDraftResult = {
  dataset: PersonalityTrainingDataset
  usableCount: number
  skipped: Array<{ sessionId: string; messageId: number; reason: string }>
}

export type PersonalityTrainingRun = {
  runId: string
  characterId: string
  backend: string
  status: string
  datasetIds?: string[]
  outputVersionId?: string
  failureStage?: string
  failureReason?: string
  logPath?: string
  metrics?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

// 与 server/application/personalityTraining/personalityTrainingAppService.ts 的
// MIN_FORMAL_TRAINING_GROUPS 联动：服务端是正式真值，这里只用于前端即时提示。
export const MIN_FORMAL_TRAINING_GROUPS = 60

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const raw = await res.text()
  let data: any = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = null
  }
  if (!res.ok || (data && data.error)) {
    const detail = data?.error || (raw ? raw.slice(0, 200) : '') || `HTTP ${res.status}`
    throw new Error(String(detail))
  }
  return data as T
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {})
  }
}

export const personalityTrainingApi = {
  listModelVersions(characterId: string) {
    return requestJson<PersonalityModelVersion[]>(API.characterPersonalityModelVersions(characterId))
  },
  installModelVersion(characterId: string, versionId: string) {
    return requestJson<PersonalityModelVersion>(
      API.characterPersonalityModelVersionInstall(characterId, versionId),
      { method: 'POST' }
    )
  },
  deleteModelVersion(characterId: string, versionId: string) {
    return requestJson<PersonalityModelVersion>(
      API.characterPersonalityModelVersion(characterId, versionId),
      { method: 'DELETE' }
    )
  },
  // 导出模型版本 zip：label 用于拼出「角色名-版本名.zip」文件名（响应头 Content-Disposition）
  async exportModelVersion(characterId: string, versionId: string, label = '') {
    const base = API.characterPersonalityModelVersionExport(characterId, versionId)
    const url = label ? `${base}?label=${encodeURIComponent(label)}` : base
    const res = await fetch(url)
    if (!res.ok) {
      const raw = await res.text()
      let detail = `HTTP ${res.status}`
      try { detail = JSON.parse(raw)?.error || detail } catch { detail = raw.slice(0, 200) || detail }
      throw new Error(String(detail))
    }
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = /filename="([^"]+)"/.exec(disposition)
    return {
      blob,
      fileName: match ? decodeURIComponent(match[1]) : `${versionId}.zip`
    }
  },
  // 导入模型包 zip：保存为新版本（不自动安装）
  importModelVersion(characterId: string, file: File) {
    const formData = new FormData()
    formData.append('model', file)
    return requestJson<PersonalityModelVersion>(
      API.characterPersonalityModelVersionImport(characterId),
      { method: 'POST', body: formData }
    )
  },
  saveModelVersionMetrics(characterId: string, versionId: string, metrics: Record<string, unknown>) {
    return requestJson<PersonalityModelVersion>(
      API.characterPersonalityModelVersionMetrics(characterId, versionId),
      jsonInit('PUT', { metrics })
    )
  },
  listDatasets(characterId: string) {
    return requestJson<PersonalityTrainingDataset[]>(API.characterPersonalityTrainingDatasets(characterId))
  },
  createDatasetDraft(characterId: string, payload: Record<string, unknown> = {}) {
    return requestJson<PersonalityTrainingDataset>(
      API.characterPersonalityTrainingDatasets(characterId),
      jsonInit('POST', payload)
    )
  },
  saveDatasetQuestionnaire(characterId: string, datasetId: string, payload: Record<string, unknown>) {
    return requestJson<PersonalityTrainingDataset>(
      API.characterPersonalityTrainingDatasetQuestionnaire(characterId, datasetId),
      jsonInit('PUT', payload)
    )
  },
  saveDatasetAnswers(
    characterId: string,
    datasetId: string,
    answers: PersonalityAnswerMap,
    options: { allowClearConfirmed?: boolean; clearReason?: string } = {}
  ) {
    return requestJson<PersonalityTrainingDataset>(
      API.characterPersonalityTrainingDatasetAnswers(characterId, datasetId),
      jsonInit('PUT', { answers, ...options })
    )
  },
  listEvaluationSets(characterId: string) {
    return requestJson<PersonalityEvaluationSet[]>(API.characterPersonalityTrainingEvaluationSets(characterId))
  },
  precheckLocalTraining(characterId: string) {
    return requestJson<PersonalityPrecheckResult>(API.characterPersonalityTrainingPrecheck(characterId), { method: 'POST' })
  },
  listTrainingRuns(characterId: string) {
    return requestJson<PersonalityTrainingRun[]>(API.characterPersonalityTrainingRuns(characterId))
  },
  startTrainingRun(characterId: string, payload: Record<string, unknown> = {}) {
    return requestJson<PersonalityTrainingRun>(API.characterPersonalityTrainingRuns(characterId), jsonInit('POST', payload))
  },
  getTrainingRun(characterId: string, runId: string) {
    return requestJson<PersonalityTrainingRun>(API.characterPersonalityTrainingRun(characterId, runId))
  },
  getTrainingRunLog(characterId: string, runId: string) {
    return requestJson<{ runId: string; log: string }>(API.characterPersonalityTrainingRunLog(characterId, runId))
  },
  cancelTrainingRun(characterId: string, runId: string) {
    return requestJson<PersonalityTrainingRun>(API.characterPersonalityTrainingRunCancel(characterId, runId), { method: 'POST' })
  },
  // 导出 Colab 训练包：返回 zip Blob 与新建任务 ID（响应头 X-Training-Run-Id）
  async exportColabPackage(characterId: string, payload: Record<string, unknown> = {}) {
    const res = await fetch(API.characterPersonalityTrainingColabPackage(characterId), jsonInit('POST', payload))
    if (!res.ok) {
      const raw = await res.text()
      let detail = `HTTP ${res.status}`
      try { detail = JSON.parse(raw)?.error || detail } catch { detail = raw.slice(0, 200) || detail }
      throw new Error(String(detail))
    }
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = /filename="([^"]+)"/.exec(disposition)
    return {
      blob,
      fileName: match ? decodeURIComponent(match[1]) : 'colab-training-package.zip',
      runId: decodeURIComponent(res.headers.get('X-Training-Run-Id') || '')
    }
  },
  listChatMessageCandidates(characterId: string, sessionId = '') {
    const url = sessionId
      ? `${API.characterPersonalityTrainingChatMessages(characterId)}?sessionId=${encodeURIComponent(sessionId)}`
      : API.characterPersonalityTrainingChatMessages(characterId)
    return requestJson<PersonalityChatMessageList>(url)
  },
  createChatSampleDraft(characterId: string, selections: Array<{ sessionId: string; messageIds: number[] }>) {
    return requestJson<PersonalityChatSampleDraftResult>(
      API.characterPersonalityTrainingChatSampleDrafts(characterId),
      jsonInit('POST', { selections })
    )
  },
  // 补投影：复用聊天链路的服务端投影 Agent（与消息投影同一真值）
  runMessageProjection(sessionId: string, messageId: number) {
    return requestJson<Record<string, unknown>>(API.chatSessionMessageProjectionRun(sessionId, messageId), { method: 'POST' })
  },
  async importTrainingRunArtifact(characterId: string, runId: string, file: File) {
    const formData = new FormData()
    formData.append('model', file)
    return requestJson<PersonalityTrainingRun>(
      API.characterPersonalityTrainingRunImport(characterId, runId),
      { method: 'POST', body: formData }
    )
  },
  saveEvaluationAnswers(characterId: string, evalSetId: string, answers: PersonalityAnswerMap, metrics: Record<string, unknown> = {}) {
    return requestJson<PersonalityEvaluationSet>(
      API.characterPersonalityTrainingEvaluationSetAnswers(characterId, evalSetId),
      jsonInit('PUT', { answers, metrics })
    )
  },
  saveEvaluationQuestions(characterId: string, evalSetId: string, questions: PersonalityQuestionGroup[]) {
    return requestJson<PersonalityEvaluationSet>(
      API.characterPersonalityTrainingEvaluationSetQuestions(characterId, evalSetId),
      jsonInit('PUT', { questions })
    )
  }
}

export type PersonalityQuestionnaireDraft = {
  dimensionPlan: unknown[]
  questionGroups: PersonalityQuestionGroup[]
  evaluationQuestions: PersonalityQuestionGroup[]
  /** 并发生成时先返回但前序仍有空档的批次；只进检查点，不混入正式顺序数组。 */
  pendingTrainingBatches?: PersonalityQuestionGroup[][]
  pendingEvaluationBatches?: PersonalityQuestionGroup[][]
}

export type PersonalityQuestionnaireGenerationProgress = {
  stage: 'dimension_plan' | 'training_batch' | 'evaluation_batch'
  done: number
  total: number
  label: string
}

export type PersonalityQuestionnaireGenerationCheckpoint = {
  schemaVersion: 1
  status: 'in_progress'
  stage: PersonalityQuestionnaireGenerationProgress['stage']
  targetTrainingGroupCount: number
  targetEvaluationQuestionCount: number
  completedTrainingCount: number
  completedEvaluationCount: number
  /** 评测题在整卷完成前没有正式评测集，暂存在同一数据集的生成检查点。 */
  evaluationQuestions: PersonalityQuestionGroup[]
  /** 并发批次允许乱序返回；先把完整批次落进检查点，前序补齐后再按题号并入正式数组。 */
  pendingTrainingBatches?: PersonalityQuestionGroup[][]
  pendingEvaluationBatches?: PersonalityQuestionGroup[][]
  savedAt: string
}

export type PersonalityQuestionnaireGenerationDiagnostic = {
  stage: string
  rawLength: number
  rawStart: string
  rawEnd: string
  likelyTruncated: boolean
  /** 代码质量门给出的逐题违规；供设问纠错与鉴心后台回执续接，不从错误文案反解析。 */
  qualityViolations?: string[]
}

const TRAINING_BATCH_SIZE = 10
const EVALUATION_BATCH_SIZE = 10
const QUESTIONNAIRE_BATCH_CONCURRENCY = 12
const QUESTIONNAIRE_GENERATION_DEADLINE_MS = 5 * 60 * 1000

const COMPLEX_SCENARIO_STRUCTURES = [
  '增加一个直接相关的时间限制',
  '增加一个清楚但不隐藏的现实代价',
  '让两项已知责任发生冲突',
  '让个人偏好与已经作出的承诺发生冲突',
  '让短期方便与长期收益发生冲突',
  '让照顾他人与保护自身边界发生冲突',
  '让统一规则与一个明确的特殊困难发生冲突',
  '让熟悉做法与一个收益不确定的新方法发生冲突',
  '让公开表达与保护私人边界发生冲突',
  '让两个同样明确的优先事项只能先处理一个'
] as const

const SIMPLE_TWIST_PATTERN = /(?:随后|接着|紧接着|不料|没想到|然而|但这时|这时却|却又|却发现|原来|反而|转而|真相|新证据|第二次|再次发生|突然又|同时又|刚.{0,18}(?:就|却|又)|短暂.{0,12}(?:后|却))/u
const INVENTED_THIRD_OPTION_PATTERN = /(?:选择|选|采用|支持|改选|走|决定使用)\s*(?:了)?\s*(?:选项|方案|路线|路径)?\s*[CcＣｃ]\b|(?:第三个选项|第三种方案|第三条路|另一条未提供的路)/iu

type DimensionQuestionKind = 'training' | 'evaluation'

type DimensionPlanItem = {
  id: string
  name: string
  targetTrainingCount: number
  targetEvaluationCount: number
  focus: string
  scenarioSeeds: string[]
}

function clampCount(value: unknown, fallback: number, allowZero = false) {
  const next = Number(value)
  if (!Number.isFinite(next) || next < 0 || (!allowZero && next === 0)) return fallback
  return Math.max(allowZero ? 0 : 1, Math.trunc(next))
}

function compactPreview(value: string, limit = 700) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function positiveInteger(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? Math.trunc(next) : 0
}

function looksTruncatedJson(text: string) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return false
  const leftBraces = (trimmed.match(/{/g) || []).length
  const rightBraces = (trimmed.match(/}/g) || []).length
  const leftBrackets = (trimmed.match(/\[/g) || []).length
  const rightBrackets = (trimmed.match(/]/g) || []).length
  return leftBraces > rightBraces || leftBrackets > rightBrackets || /[,:[{]\s*$/u.test(trimmed)
}

function createQuestionnaireParseError(
  message: string,
  rawText: string,
  stage: string,
  cause?: unknown,
  diagnosticPatch: Partial<PersonalityQuestionnaireGenerationDiagnostic> = {}
) {
  const text = String(rawText || '')
  const likelyTruncated = looksTruncatedJson(text)
  const error = new Error(likelyTruncated ? `${message}；模型输出可能被截断，请按小批次重试` : message) as Error & {
    diagnostic?: PersonalityQuestionnaireGenerationDiagnostic
    cause?: unknown
  }
  error.diagnostic = {
    stage,
    rawLength: text.length,
    rawStart: compactPreview(text.slice(0, 900)),
    rawEnd: compactPreview(text.slice(Math.max(0, text.length - 900))),
    likelyTruncated,
    ...diagnosticPatch
  }
  if (cause !== undefined) error.cause = cause
  return error
}

function extractJsonObject(rawText: string, stage: string) {
  const text = String(rawText || '').trim()
  if (!text) throw createQuestionnaireParseError('设问没有返回内容', rawText, stage)
  const unfenced = text.replace(/^```(?:json)?\s*/iu, '').replace(/```\s*$/u, '').trim()
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) throw createQuestionnaireParseError('设问输出不是 JSON 结构', rawText, stage)
  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch (error) {
    throw createQuestionnaireParseError('设问输出 JSON 解析失败', rawText, stage, error)
  }
}

function normalizeQuestionCandidate(candidate: any, index: number): PersonalityQuestionCandidate {
  const fallbackId = String.fromCharCode(65 + index)
  const id = String(candidate?.id || candidate?.candidateId || candidate?.candidate_id || fallbackId).trim() || fallbackId
  const text = String(candidate?.text || candidate?.plan || candidate?.content || '').trim()
  return {
    id,
    text,
    label: String(candidate?.label || id || fallbackId).trim() || fallbackId
  }
}

function normalizeDimensionPlanItem(item: unknown): DimensionPlanItem | null {
  const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
  const id = String(row.id || row.dimensionId || row.dimension_id || '').trim()
  const name = String(row.name || row.dimension || row.label || id).trim()
  const rawScenarioSeeds = row.scenarioSeeds ?? row.scenario_seeds
  if (!id && !name) return null
  return {
    id,
    name: name || id,
    targetTrainingCount: positiveInteger(row.targetTrainingCount ?? row.target_training_count ?? row.trainingCount ?? row.training_count),
    targetEvaluationCount: positiveInteger(row.targetEvaluationCount ?? row.target_evaluation_count ?? row.evaluationCount ?? row.evaluation_count),
    focus: String(row.focus || '').trim(),
    scenarioSeeds: Array.isArray(rawScenarioSeeds)
      ? rawScenarioSeeds.map((seed: unknown) => String(seed || '').trim()).filter(Boolean)
      : []
  }
}

function normalizeDimensionPlanItems(dimensionPlan: unknown[] | undefined | null) {
  return (Array.isArray(dimensionPlan) ? dimensionPlan : [])
    .map((item) => normalizeDimensionPlanItem(item))
    .filter(Boolean) as DimensionPlanItem[]
}

function plannedDimensionForIndex(plan: DimensionPlanItem[], absoluteIndex: number, kind: DimensionQuestionKind) {
  if (!plan.length) return ''
  const targetKey = kind === 'evaluation' ? 'targetEvaluationCount' : 'targetTrainingCount'
  const available = plan.filter((item) => item[targetKey] > 0)
  if (!available.length) return ''
  return available[(Math.max(1, absoluteIndex) - 1) % available.length]?.name || ''
}

function plannedDimensionContext(plan: DimensionPlanItem[], absoluteIndex: number, kind: DimensionQuestionKind) {
  if (!plan.length) return { item: null as DimensionPlanItem | null, localIndex: Math.max(0, absoluteIndex - 1) }
  const targetKey = kind === 'evaluation' ? 'targetEvaluationCount' : 'targetTrainingCount'
  const available = plan.filter((item) => item[targetKey] > 0)
  if (!available.length) return { item: null as DimensionPlanItem | null, localIndex: Math.max(0, absoluteIndex - 1) }
  const safeIndex = Math.max(1, absoluteIndex) - 1
  return {
    item: available[safeIndex % available.length] || null,
    localIndex: Math.floor(safeIndex / available.length)
  }
}

export function resolvePersonalityQuestionDimension(
  value: unknown,
  dimensionPlan: unknown[] | undefined | null,
  absoluteIndex: number,
  kind: DimensionQuestionKind = 'training'
) {
  const plan = normalizeDimensionPlanItems(dimensionPlan)
  const raw = String(value || '').trim()
  if (raw) {
    const matched = plan.find((item) => item.id === raw || item.name === raw)
    if (matched) return matched.name
    if (!plan.length) return raw
  }
  return plannedDimensionForIndex(plan, absoluteIndex, kind)
}

function buildBatchDimensionGuide(dimensionPlan: unknown[], startIndex: number, count: number, kind: DimensionQuestionKind) {
  const plan = normalizeDimensionPlanItems(dimensionPlan)
  if (!plan.length) return ''
  const allowedNames = plan.map((item) => item.name).filter(Boolean)
  const rows = Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset
    const name = plannedDimensionForIndex(plan, index, kind)
    return name ? `- 第 ${index} 题：dimension = "${name}"` : ''
  }).filter(Boolean)
  return [
    '本批次维度填写硬规则：',
    '- dimension 必须填写中文维度名，不得填写 d01/d02/d07 等 id，也不得留空。',
    allowedNames.length ? `- 允许的中文维度名：${allowedNames.join(' / ')}。` : '',
    rows.length ? rows.join('\n') : ''
  ].filter(Boolean).join('\n')
}

function normalizeQuestionGroup(group: any, index: number, prefix: string, options: {
  dimensionPlan?: unknown[]
  startIndex?: number
  questionKind?: DimensionQuestionKind
  requirePresetAnswer?: boolean
} = {}): PersonalityQuestionGroup | null {
  const id = String(group?.id || group?.groupId || group?.group_id || `${prefix}${String(index + 1).padStart(3, '0')}`).trim()
  const question = String(group?.question || group?.situation || group?.scene || '').trim()
  const candidates: PersonalityQuestionCandidate[] = Array.isArray(group?.candidates)
    ? group.candidates.map((candidate: any, candidateIndex: number) => normalizeQuestionCandidate(candidate, candidateIndex))
    : []
  const presetAnswerId = String(
    group?.presetAnswerId
    || group?.preset_answer_id
    || group?.suggestedAnswerId
    || group?.suggested_answer_id
    || ''
  ).trim()
  const scenarioType = String(group?.scenarioType || group?.scenario_type || '').trim()
  const pressureLevel = String(group?.pressureLevel || group?.pressure_level || '').trim() as PersonalityQuestionPressureLevel
  const diversityNote = String(group?.diversityNote || group?.diversity_note || '').trim()
  if (!id || !question) return null
  if (candidates.length !== 3 || candidates.some((candidate) => !candidate.text)) return null
  if (options.requirePresetAnswer && !presetAnswerId) return null
  if (presetAnswerId && !candidates.some((candidate) => candidate.id === presetAnswerId)) return null
  return {
    id,
    question,
    dimension: resolvePersonalityQuestionDimension(
      group?.dimension,
      options.dimensionPlan || [],
      (options.startIndex || 1) + index,
      options.questionKind || 'training'
    ),
    difficulty: String(group?.difficulty || 'standard').trim() || 'standard',
    candidates,
    ...(presetAnswerId ? { presetAnswerId } : {}),
    ...(scenarioType ? { scenarioType } : {}),
    ...(['low', 'medium', 'high'].includes(pressureLevel) ? { pressureLevel } : {}),
    ...(diversityNote ? { diversityNote } : {}),
    sourceHints: Array.isArray(group?.sourceHints || group?.source_hints)
      ? (group.sourceHints || group.source_hints).map((hint: unknown) => String(hint || '').trim()).filter(Boolean)
      : []
  }
}

function normalizeQuestionGroups(value: unknown, stage: string, expectedCount: number | null, prefix: string, options: {
  dimensionPlan?: unknown[]
  startIndex?: number
  questionKind?: DimensionQuestionKind
  requirePresetAnswer?: boolean
} = {}) {
  const rawGroups = Array.isArray(value) ? value : []
  const groups = rawGroups
    .map((group, index) => normalizeQuestionGroup(group, index, prefix, options))
    .filter(Boolean) as PersonalityQuestionGroup[]
  if (!groups.length) throw createQuestionnaireParseError('设问输出缺少有效题目', JSON.stringify(value ?? null), stage)
  if (expectedCount !== null && groups.length !== expectedCount) {
    throw createQuestionnaireParseError(`设问输出题量不符：需要 ${expectedCount} 题，实际 ${groups.length} 题`, JSON.stringify(value ?? null), stage)
  }
  return groups
}

// 解析设问输出：要求 JSON，允许包一层 ```json 代码栅栏或前后多余文字。
export function parsePersonalityQuestionnaireOutput(rawText: string, options: {
  stage?: string
  expectedQuestionGroups?: number | null
  expectedEvaluationQuestions?: number | null
  requireQuestionGroups?: boolean
  requireEvaluationQuestions?: boolean
  dimensionPlan?: unknown[]
  startIndex?: number
  questionKind?: DimensionQuestionKind
  requirePresetAnswer?: boolean
} = {}): PersonalityQuestionnaireDraft {
  const stage = options.stage || 'questionnaire'
  const parsed: any = extractJsonObject(rawText, stage)
  const rawQuestionGroups = Array.isArray(parsed?.questionGroups) ? parsed.questionGroups : []
  const rawEvaluationQuestions = Array.isArray(parsed?.evaluationQuestions) ? parsed.evaluationQuestions : []
  const dimensionPlan = Array.isArray(parsed?.dimensionPlan) ? parsed.dimensionPlan : []
  const outputDimensionPlan = options.dimensionPlan || dimensionPlan
  const questionGroups = rawQuestionGroups.length
    ? normalizeQuestionGroups(rawQuestionGroups, stage, options.expectedQuestionGroups ?? null, 'q', {
      dimensionPlan: outputDimensionPlan,
      startIndex: options.startIndex,
      questionKind: options.questionKind || 'training',
      requirePresetAnswer: options.requirePresetAnswer
    })
    : []
  const evaluationQuestions = rawEvaluationQuestions.length
    ? normalizeQuestionGroups(rawEvaluationQuestions, stage, options.expectedEvaluationQuestions ?? null, 'eval', {
      dimensionPlan: outputDimensionPlan,
      startIndex: options.startIndex,
      questionKind: options.questionKind || 'evaluation',
      requirePresetAnswer: options.requirePresetAnswer
    })
    : []
  if (options.requireQuestionGroups !== false && !questionGroups.length) throw createQuestionnaireParseError('设问输出缺少 questionGroups', rawText, stage)
  if (options.requireEvaluationQuestions === true && !evaluationQuestions.length) throw createQuestionnaireParseError('设问输出缺少 evaluationQuestions', rawText, stage)
  return { dimensionPlan, questionGroups, evaluationQuestions }
}

type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string }
type AiCaller = (messages: AiMessage[], options: Record<string, unknown>) => Promise<string | null>

function buildGenerationBasePrompt(
  finalPrompt: string,
  promptSnapshot: Record<string, unknown> | null | undefined,
  correctionBrief = ''
) {
  const basePrompt = String(promptSnapshot?.basePrompt || '').trim()
  const source = basePrompt || String(finalPrompt || '').trim()
  const calibrationContext = String(promptSnapshot?.adaptiveCalibrationContext || '').trim()
  const correction = String(correctionBrief || '').trim()
  return [
    source,
    calibrationContext ? `【上一轮人工校准结论】\n${calibrationContext}` : '',
    correction
      ? [
          '【鉴心/设问本次定向纠错】',
          correction,
          '这份纠错只用于修复上次失败批次，不得放宽正式质量门，也不得通过同义替换保留被禁止的结构。'
        ].join('\n')
      : ''
  ].filter(Boolean).join('\n\n')
}

function buildExistingQuestionLedger(groups: PersonalityQuestionGroup[]) {
  if (!groups.length) return '（暂无已生成题目）'
  return groups.map((group) => (
    `- ${group.id}｜${group.dimension || '未分维度'}｜scenarioType=${group.scenarioType || '旧题未标注'}｜pressureLevel=${group.pressureLevel || '旧题未标注'}｜情境=${String(group.question || '').trim()}`
  )).join('\n')
}

function normalizeQuestionForDiversity(value: unknown) {
  return String(value || '')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

function commonPrefixLength(left: string, right: string) {
  const limit = Math.min(left.length, right.length)
  let index = 0
  while (index < limit && left[index] === right[index]) index += 1
  return index
}

function ngrams(value: string, size = 3) {
  const grams = new Set<string>()
  for (let index = 0; index <= value.length - size; index += 1) grams.add(value.slice(index, index + size))
  return grams
}

function ngramSimilarity(left: string, right: string) {
  const leftGrams = ngrams(left)
  const rightGrams = ngrams(right)
  if (!leftGrams.size || !rightGrams.size) return 0
  let intersection = 0
  for (const gram of leftGrams) if (rightGrams.has(gram)) intersection += 1
  return intersection / Math.max(1, leftGrams.size + rightGrams.size - intersection)
}

function ngramOverlap(left: string, right: string) {
  const leftGrams = ngrams(left)
  const rightGrams = ngrams(right)
  if (!leftGrams.size || !rightGrams.size) return 0
  let intersection = 0
  for (const gram of leftGrams) if (rightGrams.has(gram)) intersection += 1
  return intersection / Math.max(1, Math.min(leftGrams.size, rightGrams.size))
}

/** 出题落库前的最后一道查重门：拒绝同一开场/危机机制只换人名地名的题。 */
export function findPersonalityQuestionDiversityViolations(
  incoming: PersonalityQuestionGroup[],
  existing: PersonalityQuestionGroup[] = [],
  options: { requireAuditMetadata?: boolean } = {}
) {
  const seen = existing.map((group) => ({
    id: group.id,
    text: normalizeQuestionForDiversity(group.question),
    dimension: String(group.dimension || '').trim(),
    scenarioType: normalizeQuestionForDiversity(group.scenarioType),
    pressureLevel: String(group.pressureLevel || '').trim()
  }))
  const violations: string[] = []
  for (const group of incoming) {
    const text = normalizeQuestionForDiversity(group.question)
    const dimension = String(group.dimension || '').trim()
    const scenarioType = normalizeQuestionForDiversity(group.scenarioType)
    const pressureLevel = String(group.pressureLevel || '').trim()
    const diversityNote = String(group.diversityNote || '').trim()
    if (options.requireAuditMetadata) {
      if (!scenarioType) violations.push(`${group.id} 缺少 scenarioType，无法审计情境类型差异`)
      if (!['low', 'medium', 'high'].includes(pressureLevel)) {
        violations.push(`${group.id} 的 pressureLevel 必须是 low/medium/high`)
      }
      if (!diversityNote) violations.push(`${group.id} 缺少 diversityNote，未说明相对历史题的类型/程度差异`)
    }
    const duplicate = seen.find((item) => {
      if (!text || !item.text) return false
      if (text === item.text) return true
      if (Math.min(text.length, item.text.length) >= 32 && commonPrefixLength(text, item.text) >= 20) return true
      return Math.min(text.length, item.text.length) >= 32
        && (ngramSimilarity(text, item.text) >= 0.5 || ngramOverlap(text, item.text) >= 0.55)
    })
    if (duplicate) violations.push(`${group.id} 与 ${duplicate.id} 的开场或危机机制过于相似`)
    const duplicateAuditPair = seen.find((item) => (
      dimension
      && scenarioType
      && pressureLevel
      && item.dimension === dimension
      && item.scenarioType === scenarioType
      && item.pressureLevel === pressureLevel
    ))
    if (duplicateAuditPair) {
      violations.push(
        `${group.id} 与 ${duplicateAuditPair.id} 在同一维度重复使用 scenarioType=${group.scenarioType}、pressureLevel=${pressureLevel}`
      )
    }
    seen.push({ id: group.id, text, dimension, scenarioType, pressureLevel })
  }
  return violations
}

function mentionsInWorldOption(question: string, label: 'A' | 'B' | 'C') {
  const escaped = `[${label}${label.toLowerCase()}${String.fromCharCode(label.charCodeAt(0) + 0xFEE0)}${String.fromCharCode(label.toLowerCase().charCodeAt(0) + 0xFEE0)}]`
  return new RegExp(`(?:选项|方案|路线|路径|做法)\\s*${escaped}|${escaped}\\s*(?:[、，,；;:：)）.]|或|和|与|/|\\\\)`, 'u').test(question)
}

function visibleTextLength(value: unknown) {
  return Array.from(String(value || '').trim()).length
}

/**
 * 生成题落库前的结构硬门：
 * - 每十题前九题必须保持单线，不接受明显的连续转折写法；
 * - 题干若显式列方案，不能只列 A/B 后让候选补造 C；
 * - 候选不能直接声称选择题干里不存在的第三条路。
 */
export function findPersonalityQuestionDesignViolations(
  incoming: PersonalityQuestionGroup[],
  startIndex = 1,
  options: { enforceComplexity?: boolean } = {}
) {
  const enforceComplexity = options.enforceComplexity !== false
  const violations: string[] = []
  for (const [offset, group] of incoming.entries()) {
    const absoluteIndex = Math.max(1, startIndex + offset)
    const question = String(group.question || '').trim()
    const simple = resolvePersonalityQuestionComplexity(absoluteIndex) === 'simple'
    if (enforceComplexity && simple && SIMPLE_TWIST_PATTERN.test(question)) {
      violations.push(`${group.id} 应为简单题，但题干包含转折或连续变化`)
    }
    if (enforceComplexity && simple && visibleTextLength(question) > PERSONALITY_SIMPLE_QUESTION_MAX_LENGTH) {
      violations.push(`${group.id} 应为简单题，但题干超过 ${PERSONALITY_SIMPLE_QUESTION_MAX_LENGTH} 个字符`)
    }
    if (enforceComplexity && simple) {
      for (const candidate of group.candidates || []) {
        if (visibleTextLength(candidate.text) > PERSONALITY_SIMPLE_CANDIDATE_MAX_LENGTH) {
          violations.push(`${group.id} 的候选 ${candidate.id} 超过 ${PERSONALITY_SIMPLE_CANDIDATE_MAX_LENGTH} 个字符，不利于快速作答`)
        }
      }
    }

    const hasA = mentionsInWorldOption(question, 'A')
    const hasB = mentionsInWorldOption(question, 'B')
    const hasC = mentionsInWorldOption(question, 'C')
    if (hasA && hasB && !hasC) {
      violations.push(`${group.id} 的题干只列出 A/B；显式列方案时必须把第三个方案写入题干`)
    }
    if (!hasC) {
      for (const candidate of group.candidates || []) {
        if (INVENTED_THIRD_OPTION_PATTERN.test(String(candidate.text || ''))) {
          violations.push(`${group.id} 的候选 ${candidate.id} 引用了题干未提供的 C 选项或第三条路`)
        }
      }
    }
  }
  return violations
}

function buildScenarioBlueprint(
  dimensionPlan: unknown[],
  startIndex: number,
  count: number,
  kind: DimensionQuestionKind
) {
  const plan = normalizeDimensionPlanItems(dimensionPlan)
  const structureOffset = kind === 'evaluation' ? 5 : 0
  return Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset
    const context = plannedDimensionContext(plan, index, kind)
    const fallbackDimension = DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS[(index - 1) % DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS.length]
    const seeds = context.item?.scenarioSeeds.length ? context.item.scenarioSeeds : [...fallbackDimension.scenarioSeeds]
    const seedOffset = kind === 'evaluation' ? Math.max(1, Math.floor(seeds.length / 2)) : 0
    const seedIndex = context.localIndex + seedOffset
    const seed = seedIndex < seeds.length
      ? seeds[seedIndex]
      : `以「${seeds[seedIndex % seeds.length]}」所测倾向为参照，原创一个不重复的新情境（扩展轮 ${Math.floor(seedIndex / seeds.length) + 1}）`
    const complexity = resolvePersonalityQuestionComplexity(index)
    const pressureLevel = resolvePersonalityQuestionPressureLevel(index, kind)
    const structure = complexity === 'simple'
      ? '单一触发 + 单一决策点；不追加转折、隐藏信息或第二次变化'
      : `最多增加一个条件：${COMPLEX_SCENARIO_STRUCTURES[(index - 1 + structureOffset) % COMPLEX_SCENARIO_STRUCTURES.length]}；不再追加第二次变化`
    return `- 第 ${index} 题：dimension="${context.item?.name || fallbackDimension.name}"；complexity=${complexity}；pressureLevel=${pressureLevel}；情境种子=${seed}；结构=${structure}`
  }).join('\n')
}

function buildDimensionPlanPrompt(
  basePrompt: string,
  trainingCount: number,
  evaluationCount: number,
  options: { projectionGrounded?: boolean } = {}
) {
  return [
    basePrompt,
    '',
    '本次只做维度规划，不生成题目。',
    `请为 ${trainingCount} 道训练题和 ${evaluationCount} 道冻结评测题制定维度分配。`,
    '维度应覆盖：稳定特质、关系边界、压力反应、亲密表达、冲突处理、行动优先级、公共场合、危险场景、长期承诺。',
    options.projectionGrounded
      ? '维度规划只能整理已有会话投影事实的侧重点，不得补造投影中没有的人物、资源、选项或后续事件。'
      : '维度规划服务于多题综合判断；不要要求单题用极端处境、连续转折或复杂推演同时测多个倾向。',
    '输出 JSON：{ "dimensionPlan": [ { "id": "d01", "name": "维度名", "targetTrainingCount": 10, "targetEvaluationCount": 2, "focus": "本维度要考察什么" } ] }。',
    '只输出 JSON，不要输出题目、Markdown 或解释。'
  ].join('\n')
}

function buildTrainingBatchPrompt(
  basePrompt: string,
  dimensionPlan: unknown[],
  startIndex: number,
  count: number,
  total: number,
  options: { projectionGrounded?: boolean; existingQuestions?: PersonalityQuestionGroup[] } = {}
) {
  const endIndex = startIndex + count - 1
  const dimensionGuide = buildBatchDimensionGuide(dimensionPlan, startIndex, count, 'training')
  const scenarioBlueprint = buildScenarioBlueprint(dimensionPlan, startIndex, count, 'training')
  return [
    basePrompt,
    options.projectionGrounded ? '' : renderPersonalityQuestionnaireBatchProtocol(),
    '',
    '本次只生成训练题的一个小批次，不生成评测题。',
    `请生成第 ${startIndex} 到第 ${endIndex} 题，共 ${count} 道；整卷训练题总数为 ${total} 道。`,
    '本批每题的维度分配：',
    dimensionGuide,
    '',
    '已生成题目全量查重表（包含每道完整题干；候选与答案不参与情境重复判断，未重复注入）：',
    buildExistingQuestionLedger(options.existingQuestions || []),
    '',
    options.projectionGrounded
      ? '本批题目来自已发生的会话投影事实：只能把对应事实压缩成容易回答的情境，不得补造投影里没有的人物、资源、选项、转折或后续事件。'
      : '本批题目情境分配（必须逐题遵守；每连续 10 题固定 9 道简单题、最多 1 道复杂题）：',
    options.projectionGrounded ? '' : scenarioBlueprint,
    '',
    '每道题必须满足：',
    options.projectionGrounded
      ? '- question：只写对应投影中已经存在的外部可观察事实，不写角色内心，不引用台词原文；能保留一个决策点就不要把事实扩写成多阶段故事。'
      : '- question：只写外部可观察情境，不写角色内心。simple 题只保留一个触发、一个主要变量和一个决策点，用一到两句短句写完；complex 题也最多增加一个直接相关条件。',
    options.projectionGrounded
      ? ''
      : '- simple 题禁止反转、隐藏信息、连续变化、多层因果和需要记忆多个人物关系的长背景；覆盖深度交给整套题量，不要塞进单题。',
    '- candidates：恰好 3 个候选计划；每个候选必须使用 { "id": "A", "text": "...", "label": "A" } 结构。',
    '- scenarioType：填写本题具体事件机制，例如“公开分歧”“私下求助”“资源分配”；不能照抄九维名称。',
    '- pressureLevel：严格使用本题分配的 low/medium/high；它表示处境压力程度，不表示题面复杂度，高压题仍须短、单线、单一决策点。',
    '- diversityNote：指出全量查重表中最接近的旧题 ID，并说明本题在事件类型、压力程度或二者组合上的实质差异；没有旧题时写“首批原创情境”。',
    '- 每个候选 text 只回应题干的明确决策点，并用一句简短表达同时写清“心里真实反应”和“对外实际表现”；三个候选都要像可能的人类反应，不能用一个明显荒谬选项凑数。',
    '- 事实边界：候选只能使用题干已经给出的人员、资源、规则、路线、能力和选项，不得补造新事实或第三条路。题干若明确列方案，必须列全 3 个；禁止只给 A/B 再让候选选择不存在的 C。候选 id=A/B/C 只是答卷标签。',
    '- sourceHints：必须至少包含“情境种子:实际使用的情境种子”和“情境结构:simple/complex”，用于质量审计。',
    '- presetAnswerId：必须填写 A/B/C 中最符合角色正式资料的一个；用户未人工改选时，它就是正式默认答案。',
    '- 不要输出 score、correct、isCorrect、分析理由或候选排序。',
    `输出 JSON：{ "questionGroups": [ ...恰好 ${count} 项... ] }。`,
    '只输出 JSON，不要输出 Markdown 或解释。'
  ].join('\n')
}

function buildEvaluationBatchPrompt(
  basePrompt: string,
  dimensionPlan: unknown[],
  startIndex: number,
  count: number,
  total: number,
  existingQuestions: PersonalityQuestionGroup[] = []
) {
  const endIndex = startIndex + count - 1
  const dimensionGuide = buildBatchDimensionGuide(dimensionPlan, startIndex, count, 'evaluation')
  const scenarioBlueprint = buildScenarioBlueprint(dimensionPlan, startIndex, count, 'evaluation')
  return [
    basePrompt,
    renderPersonalityQuestionnaireBatchProtocol(),
    '',
    '本次只生成冻结评测题的一个小批次，不生成训练题。',
    `请生成第 ${startIndex} 到第 ${endIndex} 道冻结评测题，共 ${count} 道；整套评测题总数为 ${total} 道。`,
    '评测题不得复用训练题原文，也不得泄露正确答案。',
    '本批每题的维度分配：',
    dimensionGuide,
    '',
    '训练题与已生成评测题全量查重表（包含每道完整题干；候选与答案不参与情境重复判断，未重复注入）：',
    buildExistingQuestionLedger(existingQuestions),
    '',
    '本批题目情境分配（必须逐题遵守，并与训练题保持不同表述和事件结构）：',
    scenarioBlueprint,
    '',
    '每道题必须满足：',
    '- question：只写外部可观察情境，不写角色内心。simple 题只保留一个触发、一个主要变量和一个决策点，用一到两句短句写完且不得出现转折；complex 题最多增加一个直接相关条件。',
    '- candidates：恰好 3 个候选计划；每个候选必须使用 { "id": "A", "text": "...", "label": "A" } 结构。',
    '- scenarioType：填写本题具体事件机制，不能照抄九维名称。',
    '- pressureLevel：严格使用本题分配的 low/medium/high；它表示处境压力程度，不表示题面复杂度。',
    '- diversityNote：指出全量查重表中最接近的旧题 ID，并说明本题在事件类型、压力程度或二者组合上的实质差异；没有旧题时写“首批原创情境”。',
    '- 每个候选 text 只回应题干的明确决策点，并用一句简短表达同时写清“心里真实反应”和“对外实际表现”；三个候选都必须可信。',
    '- 事实边界：候选只能使用题干已经给出的人员、资源、规则、路线、能力和选项，不得补造新事实或第三条路。题干若明确列方案，必须列全 3 个；禁止只给 A/B 再让候选选择不存在的 C。候选 id=A/B/C 只是答卷标签。',
    '- sourceHints：必须至少包含“情境种子:实际使用的情境种子”和“情境结构:simple/complex”，用于质量审计。',
    '- presetAnswerId：必须填写 A/B/C 中最符合角色正式资料的一个；用户未人工改选时，它就是正式默认答案。',
    '- 不要输出 score、correct、isCorrect、分析理由或候选排序。',
    `输出 JSON：{ "evaluationQuestions": [ ...恰好 ${count} 项... ] }。`,
    '只输出 JSON，不要输出 Markdown 或解释。'
  ].join('\n')
}

type QuestionnaireGenerationBatchJob = {
  kind: 'training' | 'evaluation'
  start: number
  count: number
}

async function runQuestionnaireBatchPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  onFirstFailure?: () => void
) {
  let cursor = 0
  let firstFailure: unknown
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (firstFailure === undefined) {
        const index = cursor
        cursor += 1
        if (index >= items.length) return
        try {
          await worker(items[index])
        } catch (error) {
          if (firstFailure === undefined) {
            firstFailure = error
            onFirstFailure?.()
          }
        }
      }
    }
  )
  await Promise.all(workers)
  if (firstFailure !== undefined) throw firstFailure
}

// 出题调用：与 langhuanAgentAssist 的 Agent 调用方式联动（同 buildModelUsageAiOptions + feature:'agent'），
// 后续若统一 Agent 调用层，这里要同步改。
export async function runPersonalityQuestionnaireGeneration(input: {
  finalPrompt: string
  promptSnapshot?: Record<string, unknown> | null
  characterName: string
  agentConfig: Partial<AgentModelConfig> | null | undefined
  callAI: AiCaller
  resumeDraft?: Partial<PersonalityQuestionnaireDraft> | null
  /** 设问从上次结构化失败诊断提炼出的定向纠错要求。 */
  correctionBrief?: string
  /** 父 Agent/用户显式停止设问时传播到批次生成、检查点与供应商请求。 */
  signal?: AbortSignal
  onProgress?: (progress: PersonalityQuestionnaireGenerationProgress) => void
  onCheckpoint?: (
    draft: PersonalityQuestionnaireDraft,
    checkpoint: PersonalityQuestionnaireGenerationCheckpoint
  ) => void | Promise<void>
}): Promise<PersonalityQuestionnaireDraft> {
  const basePrompt = buildGenerationBasePrompt(
    input.finalPrompt,
    input.promptSnapshot,
    input.correctionBrief
  )
  if (!basePrompt) throw new Error('数据集缺少出题 prompt 快照')

  const targetTrainingGroupCount = clampCount(input.promptSnapshot?.targetTrainingGroupCount, PERSONALITY_CALIBRATION_ROUND_SIZE)
  const targetEvaluationQuestionCount = clampCount(input.promptSnapshot?.targetEvaluationQuestionCount, 0, true)
  const projectionGrounded = input.promptSnapshot?.promptKind === 'personality_chat_sample_generation'
  const totalBatches = 1
    + Math.ceil(targetTrainingGroupCount / TRAINING_BATCH_SIZE)
    + Math.ceil(targetEvaluationQuestionCount / EVALUATION_BATCH_SIZE)
  let dimensionPlan = Array.isArray(input.resumeDraft?.dimensionPlan) ? [...input.resumeDraft.dimensionPlan] : []
  const questionGroups = Array.isArray(input.resumeDraft?.questionGroups)
    ? input.resumeDraft.questionGroups.slice(0, targetTrainingGroupCount)
    : []
  const evaluationQuestions = Array.isArray(input.resumeDraft?.evaluationQuestions)
    ? input.resumeDraft.evaluationQuestions.slice(0, targetEvaluationQuestionCount)
    : []
  const trainingResults = new Map<number, PersonalityQuestionGroup[]>(
    (input.resumeDraft?.pendingTrainingBatches || [])
      .filter((batch) => Array.isArray(batch) && batch.length)
      .map((batch) => {
        const start = Math.max(1, Number.parseInt(String(batch[0]?.id || '').replace(/\D/gu, ''), 10) || 1)
        return [start, batch]
      })
  )
  const evaluationResults = new Map<number, PersonalityQuestionGroup[]>(
    (input.resumeDraft?.pendingEvaluationBatches || [])
      .filter((batch) => Array.isArray(batch) && batch.length)
      .map((batch) => {
        const start = Math.max(1, Number.parseInt(String(batch[0]?.id || '').replace(/\D/gu, ''), 10) || 1)
        return [start, batch]
      })
  )
  let done = (dimensionPlan.length ? 1 : 0)
    + Math.ceil(questionGroups.length / TRAINING_BATCH_SIZE)
    + Math.ceil(evaluationQuestions.length / EVALUATION_BATCH_SIZE)

  const persistCheckpoint = async (stage: PersonalityQuestionnaireGenerationProgress['stage']) => {
    if (!input.onCheckpoint) return
    const draft: PersonalityQuestionnaireDraft = {
      dimensionPlan: [...dimensionPlan],
      questionGroups: [...questionGroups],
      evaluationQuestions: [...evaluationQuestions],
      pendingTrainingBatches: [...trainingResults.values()].map((batch) => [...batch]),
      pendingEvaluationBatches: [...evaluationResults.values()].map((batch) => [...batch])
    }
    await input.onCheckpoint(draft, {
      schemaVersion: 1,
      status: 'in_progress',
      stage,
      targetTrainingGroupCount,
      targetEvaluationQuestionCount,
      completedTrainingCount: questionGroups.length,
      completedEvaluationCount: evaluationQuestions.length,
      evaluationQuestions: [...evaluationQuestions],
      pendingTrainingBatches: draft.pendingTrainingBatches,
      pendingEvaluationBatches: draft.pendingEvaluationBatches,
      savedAt: new Date().toISOString()
    })
  }

  const deadlineController = new AbortController()
  const forwardAbort = () => deadlineController.abort(input.signal?.reason)
  if (input.signal?.aborted) forwardAbort()
  else input.signal?.addEventListener('abort', forwardAbort, { once: true })
  let deadlineExceeded = false
  const deadlineTimer = setTimeout(() => {
    deadlineExceeded = true
    deadlineController.abort()
  }, QUESTIONNAIRE_GENERATION_DEADLINE_MS)

  const callStep = async (prompt: string, stage: string, logLabel: string, usageLabel: string) => {
    const output = await input.callAI([{ role: 'user', content: prompt }], {
      ...buildTaskModelAiOptions(input.agentConfig, 'personalityTraining', { maxTokens: 4096, temperature: 0.45, thinking: 'disabled' }),
      feature: 'agent',
      logLabel,
      usageLabel,
      placeLabel: input.characterName || '人格模型训练',
      placeType: 'other',
      registerAbortController: false,
      signal: deadlineController.signal
    })
    const text = String(output || '').trim()
    if (/^\[API调用失败:/u.test(text)) {
      throw createQuestionnaireParseError(text.replace(/^\[|\]$/g, ''), text, stage)
    }
    return text
  }

  try {
    if (!dimensionPlan.length) {
      input.onProgress?.({ stage: 'dimension_plan', done, total: totalBatches, label: '规划出题维度' })
      if (projectionGrounded) {
        const dimensionOutput = await callStep(
          buildDimensionPlanPrompt(basePrompt, targetTrainingGroupCount, targetEvaluationQuestionCount, { projectionGrounded: true }),
          'dimension_plan',
          'personality-questionnaire-dimension-plan',
          'Agent 规划人格问卷维度'
        )
        const dimensionDraft = parsePersonalityQuestionnaireOutput(dimensionOutput, {
          stage: 'dimension_plan',
          requireQuestionGroups: false,
          requireEvaluationQuestions: false
        })
        dimensionPlan = dimensionDraft.dimensionPlan
      } else {
        dimensionPlan = buildDefaultPersonalityQuestionnaireDimensionPlan(
          targetTrainingGroupCount,
          targetEvaluationQuestionCount
        )
      }
      done += 1
      await persistCheckpoint('dimension_plan')
      input.onProgress?.({ stage: 'dimension_plan', done, total: totalBatches, label: '维度规划已落库' })
    } else {
      input.onProgress?.({ stage: 'dimension_plan', done, total: totalBatches, label: '已从检查点恢复维度规划' })
    }

    const jobs: QuestionnaireGenerationBatchJob[] = []
    for (let start = questionGroups.length + 1; start <= targetTrainingGroupCount; start += TRAINING_BATCH_SIZE) {
      if (trainingResults.has(start)) continue
      jobs.push({
        kind: 'training',
        start,
        count: Math.min(TRAINING_BATCH_SIZE, targetTrainingGroupCount - start + 1)
      })
    }
    for (let start = evaluationQuestions.length + 1; start <= targetEvaluationQuestionCount; start += EVALUATION_BATCH_SIZE) {
      if (evaluationResults.has(start)) continue
      jobs.push({
        kind: 'evaluation',
        start,
        count: Math.min(EVALUATION_BATCH_SIZE, targetEvaluationQuestionCount - start + 1)
      })
    }

    const initialTrainingLedger = [...questionGroups]
    const initialEvaluationLedger = [...questionGroups, ...evaluationQuestions]
    const trainingJobs = new Map(jobs.filter((job) => job.kind === 'training').map((job) => [job.start, job]))
    const evaluationJobs = new Map(jobs.filter((job) => job.kind === 'evaluation').map((job) => [job.start, job]))

    const generateTrainingBatch = async (
      job: QuestionnaireGenerationBatchJob,
      existingQuestions: PersonalityQuestionGroup[],
      violations: string[] = []
    ) => {
      const baseBatchPrompt = buildTrainingBatchPrompt(
        basePrompt,
        dimensionPlan,
        job.start,
        job.count,
        targetTrainingGroupCount,
        { projectionGrounded, existingQuestions }
      )
      const prompt = violations.length
        ? [
            baseBatchPrompt,
            '',
            '上一版未通过题目质量硬门，请按下面问题整批重写后重新输出：',
            ...violations.map((item) => `- ${item}`)
          ].join('\n')
        : baseBatchPrompt
      input.onProgress?.({
        stage: 'training_batch',
        done,
        total: totalBatches,
        label: violations.length
          ? `重写训练题 ${job.start}-${job.start + job.count - 1}`
          : `并行生成训练题 ${job.start}-${job.start + job.count - 1}`
      })
      const output = await callStep(
        prompt,
        violations.length ? `training_batch_${job.start}_quality_retry` : `training_batch_${job.start}`,
        violations.length
          ? 'personality-questionnaire-training-quality-retry'
          : 'personality-questionnaire-training-batch',
        violations.length ? 'Agent 重写未通过质量门的人格训练题' : 'Agent 生成人格训练题'
      )
      const draft = parsePersonalityQuestionnaireOutput(output, {
        stage: violations.length ? `training_batch_${job.start}_quality_retry` : `training_batch_${job.start}`,
        expectedQuestionGroups: job.count,
        requireEvaluationQuestions: false,
        dimensionPlan,
        startIndex: job.start,
        questionKind: 'training',
        requirePresetAnswer: true
      })
      return {
        output,
        groups: draft.questionGroups.map((group, offset) => ({
          ...group,
          id: `q${String(job.start + offset).padStart(3, '0')}`
        }))
      }
    }

    const generateEvaluationBatch = async (
      job: QuestionnaireGenerationBatchJob,
      existingQuestions: PersonalityQuestionGroup[],
      violations: string[] = []
    ) => {
      const baseBatchPrompt = buildEvaluationBatchPrompt(
        basePrompt,
        dimensionPlan,
        job.start,
        job.count,
        targetEvaluationQuestionCount,
        existingQuestions
      )
      const prompt = violations.length
        ? [
            baseBatchPrompt,
            '',
            '上一版未通过题目质量硬门，请按下面问题整批重写后重新输出：',
            ...violations.map((item) => `- ${item}`)
          ].join('\n')
        : baseBatchPrompt
      input.onProgress?.({
        stage: 'evaluation_batch',
        done,
        total: totalBatches,
        label: violations.length
          ? `重写评测题 ${job.start}-${job.start + job.count - 1}`
          : `并行生成评测题 ${job.start}-${job.start + job.count - 1}`
      })
      const output = await callStep(
        prompt,
        violations.length ? `evaluation_batch_${job.start}_quality_retry` : `evaluation_batch_${job.start}`,
        violations.length
          ? 'personality-questionnaire-evaluation-quality-retry'
          : 'personality-questionnaire-evaluation-batch',
        violations.length ? 'Agent 重写未通过质量门的人格评测题' : 'Agent 生成人格冻结评测题'
      )
      const draft = parsePersonalityQuestionnaireOutput(output, {
        stage: violations.length ? `evaluation_batch_${job.start}_quality_retry` : `evaluation_batch_${job.start}`,
        expectedEvaluationQuestions: job.count,
        requireQuestionGroups: false,
        requireEvaluationQuestions: true,
        dimensionPlan,
        startIndex: job.start,
        questionKind: 'evaluation',
        requirePresetAnswer: true
      })
      return {
        output,
        groups: draft.evaluationQuestions.map((group, offset) => ({
          ...group,
          id: `eval${String(job.start + offset).padStart(3, '0')}`
        }))
      }
    }

    const findBatchQualityViolations = (
      groups: PersonalityQuestionGroup[],
      existingQuestions: PersonalityQuestionGroup[],
      start: number,
      options: { projectionGrounded?: boolean } = {}
    ) => [
      ...(options.projectionGrounded
        ? []
        : findPersonalityQuestionDiversityViolations(groups, existingQuestions, { requireAuditMetadata: true })),
      ...findPersonalityQuestionDesignViolations(groups, start, {
        enforceComplexity: !options.projectionGrounded
      })
    ]

    const flushReadyResults = async (
      fallbackStage: PersonalityQuestionnaireGenerationProgress['stage']
    ) => {
      let persisted = false
      while (questionGroups.length < targetTrainingGroupCount) {
        const start = questionGroups.length + 1
        let groups = trainingResults.get(start)
        if (!groups) break
        const job = trainingJobs.get(start) || { kind: 'training', start, count: groups.length } as const
        let violations = findBatchQualityViolations(groups, questionGroups, start, { projectionGrounded })
        if (violations.length) {
          const rewritten = await generateTrainingBatch(job, questionGroups, violations)
          groups = rewritten.groups
          violations = findBatchQualityViolations(groups, questionGroups, start, { projectionGrounded })
          if (violations.length) {
            throw createQuestionnaireParseError(
              `设问重写后仍未通过题目质量硬门：${violations.join('；')}`,
              rewritten.output,
              `training_batch_${start}_quality_retry`,
              undefined,
              { qualityViolations: [...violations] }
            )
          }
        }
        trainingResults.delete(start)
        questionGroups.push(...groups)
        done += 1
        await persistCheckpoint('training_batch')
        persisted = true
        input.onProgress?.({
          stage: 'training_batch',
          done,
          total: totalBatches,
          label: `训练题已落库 ${questionGroups.length}/${targetTrainingGroupCount}`
        })
      }

      if (questionGroups.length < targetTrainingGroupCount) {
        if (!persisted && (trainingResults.size || evaluationResults.size)) {
          await persistCheckpoint(fallbackStage)
        }
        return
      }
      while (evaluationQuestions.length < targetEvaluationQuestionCount) {
        const start = evaluationQuestions.length + 1
        let groups = evaluationResults.get(start)
        if (!groups) break
        const job = evaluationJobs.get(start) || { kind: 'evaluation', start, count: groups.length } as const
        let violations = findBatchQualityViolations(groups, [...questionGroups, ...evaluationQuestions], start)
        if (violations.length) {
          const rewritten = await generateEvaluationBatch(job, [...questionGroups, ...evaluationQuestions], violations)
          groups = rewritten.groups
          violations = findBatchQualityViolations(groups, [...questionGroups, ...evaluationQuestions], start)
          if (violations.length) {
            throw createQuestionnaireParseError(
              `评测题重写后仍未通过题目质量硬门：${violations.join('；')}`,
              rewritten.output,
              `evaluation_batch_${start}_quality_retry`,
              undefined,
              { qualityViolations: [...violations] }
            )
          }
        }
        evaluationResults.delete(start)
        evaluationQuestions.push(...groups)
        done += 1
        await persistCheckpoint('evaluation_batch')
        persisted = true
        input.onProgress?.({
          stage: 'evaluation_batch',
          done,
          total: totalBatches,
          label: `评测题已落库 ${evaluationQuestions.length}/${targetEvaluationQuestionCount}`
        })
      }
      if (!persisted && (trainingResults.size || evaluationResults.size)) {
        await persistCheckpoint(fallbackStage)
      }
    }

    let flushChain = Promise.resolve()
    const scheduleFlush = (stage: PersonalityQuestionnaireGenerationProgress['stage']) => {
      flushChain = flushChain.then(() => flushReadyResults(stage))
      return flushChain
    }

    if (trainingResults.size || evaluationResults.size) {
      await scheduleFlush(trainingResults.size ? 'training_batch' : 'evaluation_batch')
    }

    if (jobs.length) {
      input.onProgress?.({
        stage: jobs.some((job) => job.kind === 'training') ? 'training_batch' : 'evaluation_batch',
        done,
        total: totalBatches,
        label: `并行启动 ${jobs.length} 个出题批次`
      })
      await runQuestionnaireBatchPool(
        jobs,
        QUESTIONNAIRE_BATCH_CONCURRENCY,
        async (job) => {
          if (job.kind === 'training') {
            const result = await generateTrainingBatch(job, initialTrainingLedger)
            trainingResults.set(job.start, result.groups)
          } else {
            const result = await generateEvaluationBatch(job, initialEvaluationLedger)
            evaluationResults.set(job.start, result.groups)
          }
          await scheduleFlush(job.kind === 'training' ? 'training_batch' : 'evaluation_batch')
        },
        () => deadlineController.abort()
      )
      await flushChain
    }

    return { dimensionPlan, questionGroups, evaluationQuestions }
  } catch (error) {
    deadlineController.abort()
    if (deadlineExceeded) {
      throw new Error('人格问卷出题超过 5 分钟；已保留每 10 题检查点，可直接续跑未完成批次。')
    }
    throw error
  } finally {
    input.signal?.removeEventListener('abort', forwardAbort)
    clearTimeout(deadlineTimer)
  }
}

// ---------- 浏览器评测（第 7 批） ----------

export type PersonalityEvaluationRunResult = {
  evaluatedGroups: number
  top1Hits: number
  top1Accuracy: number
  mrr: number
  performanceBudgetRatio: number
  questionResults: PersonalityEvaluationQuestionResult[]
}

export type PersonalityEvaluationAnswerSnapshot = {
  candidateId: string
  label: string
  text: string
  score?: number
}

export type PersonalityEvaluationQuestionResult = {
  questionId: string
  dimension: string
  question: string
  expectedSource: 'confirmed' | 'preset'
  expectedAnswer: PersonalityEvaluationAnswerSnapshot
  modelAnswer: PersonalityEvaluationAnswerSnapshot
  rankedAnswers: PersonalityEvaluationAnswerSnapshot[]
  hit: boolean
}

export const PERSONALITY_EVALUATION_PERFORMANCE_BUDGET = 0.5

export function calculatePersonalityEvaluationPauseMs(
  inferenceDurationMs: number,
  performanceBudgetRatio = PERSONALITY_EVALUATION_PERFORMANCE_BUDGET
) {
  const duration = Math.max(0, Number(inferenceDurationMs) || 0)
  const ratio = Math.min(1, Math.max(0.1, Number(performanceBudgetRatio) || PERSONALITY_EVALUATION_PERFORMANCE_BUDGET))
  if (ratio >= 1 || duration <= 0) return 0
  // 每题推理后按“忙碌时长 : 休息时长”控制平均占用；0.5 即推理多久就让机器喘息多久。
  return Math.min(5000, Math.max(80, Math.round(duration * ((1 - ratio) / ratio))))
}

function waitForPersonalityEvaluationBreather(milliseconds: number) {
  return milliseconds > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve()
}

/**
 * 用指定版本模型在浏览器里跑冻结评测集：人工选择优先；未人工选择时用合法预设答案。
 */
export async function runPersonalityEvaluation(input: {
  modelPath: string
  questions: PersonalityQuestionGroup[]
  answers: PersonalityAnswerMap
  onProgress?: (done: number, total: number) => void
  onQuestionResult?: (result: PersonalityEvaluationQuestionResult, done: number, total: number) => void
  performanceBudgetRatio?: number
}): Promise<PersonalityEvaluationRunResult> {
  const answered = input.questions.filter((question) => {
    return Boolean(resolvePersonalityQuestionAnswer(question, input.answers)) && (question.candidates?.length || 0) >= 2
  })
  if (!answered.length) throw new Error('评测集没有可用的人工答案或预设答案，先补全考卷再运行评测')

  const { scorePersonalityPlans } = await import('./personalityRerankerBrowser')
  const performanceBudgetRatio = Math.min(
    1,
    Math.max(0.1, Number(input.performanceBudgetRatio) || PERSONALITY_EVALUATION_PERFORMANCE_BUDGET)
  )
  let top1Hits = 0
  let reciprocalSum = 0
  let done = 0
  const questionResults: PersonalityEvaluationQuestionResult[] = []
  for (const question of answered) {
    const resolvedAnswer = resolvePersonalityQuestionAnswer(question, input.answers)
    const answerId = String(resolvedAnswer?.candidateId || '')
    const inferenceStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const scores = await scorePersonalityPlans({
      personalityModelPath: input.modelPath,
      situation: question.question,
      plans: question.candidates.map((candidate) => candidate.text)
    })
    const inferenceFinishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const ranked = question.candidates
      .map((candidate, index) => ({
        candidateId: candidate.id,
        label: candidate.label || String.fromCharCode(65 + index),
        text: candidate.text,
        score: Number(scores[index] ?? Number.NEGATIVE_INFINITY)
      }))
      .sort((a, b) => b.score - a.score)
    const expectedCandidateIndex = question.candidates.findIndex((candidate) => String(candidate.id) === answerId)
    const expectedCandidate = question.candidates[expectedCandidateIndex]
    const modelAnswer = ranked[0]
    const hit = String(modelAnswer?.candidateId || '') === answerId
    if (hit) top1Hits += 1
    const rank = ranked.findIndex((item) => String(item.candidateId) === answerId)
    if (rank >= 0) reciprocalSum += 1 / (rank + 1)
    done += 1
    const questionResult: PersonalityEvaluationQuestionResult = {
      questionId: question.id,
      dimension: question.dimension,
      question: question.question,
      expectedSource: resolvedAnswer?.source === 'confirmed' ? 'confirmed' : 'preset',
      expectedAnswer: {
        candidateId: answerId,
        label: expectedCandidate?.label || String.fromCharCode(65 + Math.max(0, expectedCandidateIndex)),
        text: expectedCandidate?.text || ''
      },
      modelAnswer: {
        candidateId: modelAnswer?.candidateId || '',
        label: modelAnswer?.label || '',
        text: modelAnswer?.text || '',
        score: modelAnswer?.score
      },
      rankedAnswers: ranked,
      hit
    }
    questionResults.push(questionResult)
    input.onQuestionResult?.(questionResult, done, answered.length)
    input.onProgress?.(done, answered.length)
    if (done < answered.length) {
      await waitForPersonalityEvaluationBreather(calculatePersonalityEvaluationPauseMs(
        inferenceFinishedAt - inferenceStartedAt,
        performanceBudgetRatio
      ))
    }
  }
  return {
    evaluatedGroups: answered.length,
    top1Hits,
    top1Accuracy: answered.length ? top1Hits / answered.length : 0,
    mrr: answered.length ? reciprocalSum / answered.length : 0,
    performanceBudgetRatio,
    questionResults
  }
}

// ---------- 视图层派生工具（不回写数据库） ----------

export function normalizeAnswerEntry(value: unknown): PersonalityAnswerEntry | null {
  if (!value) return null
  if (typeof value === 'string') return { candidateId: value, reviewState: 'confirmed' }
  if (typeof value === 'object') return value as PersonalityAnswerEntry
  return null
}

export function isConfirmedAnswer(entry: PersonalityAnswerEntry | null | undefined) {
  if (!entry) return false
  if (entry.skipped === true) return false
  const state = String(entry.reviewState || 'confirmed')
  return Boolean(String(entry.candidateId || '').trim()) && state !== 'skipped' && state !== 'rejected'
}

export function countAnswers(answers: PersonalityAnswerMap | undefined) {
  let confirmed = 0
  let skipped = 0
  for (const key of Object.keys(answers || {})) {
    const entry = normalizeAnswerEntry((answers as PersonalityAnswerMap)[key])
    if (!entry) continue
    if (isConfirmedAnswer(entry)) confirmed += 1
    else if (entry.skipped === true || String(entry.reviewState || '') === 'skipped') skipped += 1
  }
  return { confirmed, skipped }
}

export type PersonalityResolvedAnswer = {
  candidateId: string
  source: 'confirmed' | 'preset'
}

/** 正式答题真值：合法人工确认优先；否则合法 presetAnswerId 自动代选。 */
export function resolvePersonalityQuestionAnswer(
  question: PersonalityQuestionGroup,
  answers: PersonalityAnswerMap | undefined
): PersonalityResolvedAnswer | null {
  const candidateIds = new Set((question.candidates || []).map((candidate) => String(candidate.id || '').trim()).filter(Boolean))
  const entry = normalizeAnswerEntry(answers?.[question.id])
  const explicitId = String(entry?.candidateId || '').trim()
  if (isConfirmedAnswer(entry) && candidateIds.has(explicitId)) {
    return { candidateId: explicitId, source: 'confirmed' }
  }
  const presetId = String(question.presetAnswerId || '').trim()
  if (presetId && candidateIds.has(presetId)) return { candidateId: presetId, source: 'preset' }
  return null
}

export function countResolvedQuestionAnswers(
  questions: PersonalityQuestionGroup[] | undefined,
  answers: PersonalityAnswerMap | undefined
) {
  let confirmed = 0
  let preset = 0
  for (const question of questions || []) {
    const resolved = resolvePersonalityQuestionAnswer(question, answers)
    if (resolved?.source === 'confirmed') confirmed += 1
    if (resolved?.source === 'preset') preset += 1
  }
  const total = (questions || []).length
  return { confirmed, preset, resolved: confirmed + preset, unresolved: Math.max(0, total - confirmed - preset) }
}

function stringList(value: unknown, maxItems = 12, maxLength = 180) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function normalizeCalibrationRoundReview(value: unknown): PersonalityCalibrationRoundReview | null {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const roundNumber = Math.max(0, Math.trunc(Number(row.roundNumber) || 0))
  if (!roundNumber) return null
  const assessment = String(row.assessment || '') as PersonalityCalibrationRoundAssessment
  return {
    roundNumber,
    questionStart: Math.max(1, Math.trunc(Number(row.questionStart) || ((roundNumber - 1) * PERSONALITY_CALIBRATION_ROUND_SIZE + 1))),
    questionEnd: Math.max(1, Math.trunc(Number(row.questionEnd) || (roundNumber * PERSONALITY_CALIBRATION_ROUND_SIZE))),
    confirmedCount: Math.max(0, Math.trunc(Number(row.confirmedCount) || 0)),
    presetHitCount: Math.max(0, Math.trunc(Number(row.presetHitCount) || 0)),
    presetHitRate: Math.max(0, Math.min(1, Number(row.presetHitRate) || 0)),
    assessment: ['richer', 'possible_conflict', 'mixed', 'stable'].includes(assessment) ? assessment : 'stable',
    summary: String(row.summary || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    stableTraits: stringList(row.stableTraits),
    contextualTraits: stringList(row.contextualTraits),
    possibleContradictions: stringList(row.possibleContradictions),
    reviewedAt: String(row.reviewedAt || '')
  }
}

/**
 * 删除训练题后，删除点所在轮次及后续复盘已经不再对应当前题序，必须退出正式复盘真值。
 * 更早且完整保留的轮次可以继续沿用；生成 checkpoint 同时清空，防止旧待并入批次把已删题补回来。
 */
export function reconcilePersonalityCalibrationPromptAfterQuestionDeletion(input: {
  promptSnapshot?: Record<string, unknown> | null
  firstDeletedQuestionNumber: number
  remainingQuestionCount: number
}): Record<string, unknown> {
  const snapshot = { ...(input.promptSnapshot || {}) }
  const affectedRoundNumber = Math.floor(
    Math.max(0, Math.trunc(Number(input.firstDeletedQuestionNumber) || 1) - 1)
      / PERSONALITY_CALIBRATION_ROUND_SIZE
  ) + 1
  const retainedReviews = (Array.isArray(snapshot.adaptiveCalibrationReviews)
    ? snapshot.adaptiveCalibrationReviews
    : [])
    .map((item) => normalizeCalibrationRoundReview(item))
    .filter((review): review is PersonalityCalibrationRoundReview => Boolean(
      review && review.roundNumber < affectedRoundNumber
    ))
  const adaptiveCalibrationContext = retainedReviews.map((review) => [
    `已保留第 ${review.roundNumber} 轮复盘（第 ${review.questionStart}-${review.questionEnd} 题）：预设命中 ${review.presetHitCount}/${review.confirmedCount}（${Math.round(review.presetHitRate * 100)}%）。`,
    `整体判断：${review.summary}`,
    review.stableTraits.length ? `已稳定倾向：${review.stableTraits.join('；')}` : '',
    review.contextualTraits.length ? `需要保留情境差异：${review.contextualTraits.join('；')}` : '',
    review.possibleContradictions.length ? `后续优先澄清：${review.possibleContradictions.join('；')}` : ''
  ].filter(Boolean).join('\n')).join('\n\n')
  return {
    ...snapshot,
    targetTrainingGroupCount: Math.max(0, Math.trunc(Number(input.remainingQuestionCount) || 0)),
    adaptiveCalibrationReviews: retainedReviews,
    adaptiveCalibrationContext,
    questionnaireGenerationCheckpoint: null,
    lastGenerationFailure: null
  }
}

export function summarizePersonalityAdaptiveCalibration(input: {
  questionGroups?: PersonalityQuestionGroup[] | null
  answers?: PersonalityAnswerMap | null
  promptSnapshot?: Record<string, unknown> | null
}): PersonalityAdaptiveCalibrationSummary {
  const groups = input.questionGroups || []
  const answers = input.answers || {}
  const reviews = (Array.isArray(input.promptSnapshot?.adaptiveCalibrationReviews)
    ? input.promptSnapshot?.adaptiveCalibrationReviews
    : [])
    .map((item) => normalizeCalibrationRoundReview(item))
    .filter(Boolean) as PersonalityCalibrationRoundReview[]
  const reviewNumbers = new Set(reviews.map((review) => review.roundNumber))
  const rounds: PersonalityCalibrationRoundStats[] = []
  for (let start = 0; start < groups.length; start += PERSONALITY_CALIBRATION_ROUND_SIZE) {
    const roundGroups = groups.slice(start, start + PERSONALITY_CALIBRATION_ROUND_SIZE)
    let confirmedCount = 0
    let presetHitCount = 0
    for (const group of roundGroups) {
      const entry = normalizeAnswerEntry(answers[group.id])
      if (!isConfirmedAnswer(entry)) continue
      confirmedCount += 1
      if (String(entry?.candidateId || '') === String(group.presetAnswerId || '')) presetHitCount += 1
    }
    const roundNumber = Math.floor(start / PERSONALITY_CALIBRATION_ROUND_SIZE) + 1
    rounds.push({
      roundNumber,
      questionStart: start + 1,
      questionEnd: start + roundGroups.length,
      questionCount: roundGroups.length,
      confirmedCount,
      presetHitCount,
      correctionCount: Math.max(0, confirmedCount - presetHitCount),
      presetHitRate: confirmedCount ? presetHitCount / confirmedCount : null,
      complete: roundGroups.length === PERSONALITY_CALIBRATION_ROUND_SIZE
        && confirmedCount === PERSONALITY_CALIBRATION_ROUND_SIZE,
      reviewed: reviewNumbers.has(roundNumber)
    })
  }
  const nextRound = rounds.find((round) => !round.reviewed) || null
  const recentReviewedRounds = rounds
    .filter((round) => round.complete && round.reviewed)
    .slice(-PERSONALITY_CALIBRATION_STOP_WINDOW_ROUNDS)
  const rollingConfirmed = recentReviewedRounds.reduce((sum, round) => sum + round.confirmedCount, 0)
  const rollingHits = recentReviewedRounds.reduce((sum, round) => sum + round.presetHitCount, 0)
  const rollingPresetHitRate = recentReviewedRounds.length === PERSONALITY_CALIBRATION_STOP_WINDOW_ROUNDS && rollingConfirmed
    ? rollingHits / rollingConfirmed
    : null
  const recentReviewNumbers = new Set(recentReviewedRounds.map((round) => round.roundNumber))
  const hasUnresolvedContradiction = reviews.some((review) => (
    recentReviewNumbers.has(review.roundNumber) && review.possibleContradictions.length > 0
  ))
  return {
    roundSize: PERSONALITY_CALIBRATION_ROUND_SIZE,
    rounds,
    reviews,
    nextReviewRoundNumber: nextRound?.roundNumber || (rounds.length + 1),
    canReviewNextRound: Boolean(nextRound?.complete),
    rollingPresetHitRate,
    targetPresetHitRate: PERSONALITY_CALIBRATION_TARGET_PRESET_HIT_RATE,
    targetWindowRounds: PERSONALITY_CALIBRATION_STOP_WINDOW_ROUNDS,
    canSuggestStop: rollingPresetHitRate !== null
      && rollingPresetHitRate >= PERSONALITY_CALIBRATION_TARGET_PRESET_HIT_RATE
      && !hasUnresolvedContradiction
  }
}

export function buildCompletedPersonalityCalibrationReviewPromptSnapshot(input: {
  dataset: PersonalityTrainingDataset
  review: Omit<PersonalityCalibrationRoundReview, 'reviewedAt'>
}): Record<string, unknown> {
  const snapshot = { ...((input.dataset.promptSnapshot || {}) as Record<string, unknown>) }
  const reviews = (Array.isArray(snapshot.adaptiveCalibrationReviews)
    ? snapshot.adaptiveCalibrationReviews
    : [])
    .map((item) => normalizeCalibrationRoundReview(item))
    .filter(Boolean) as PersonalityCalibrationRoundReview[]
  const review: PersonalityCalibrationRoundReview = {
    ...input.review,
    reviewedAt: new Date().toISOString()
  }
  const nextReviews = [...reviews.filter((item) => item.roundNumber !== review.roundNumber), review]
    .sort((left, right) => left.roundNumber - right.roundNumber)
  const contextLines = [
    `已完成人工校准第 ${review.roundNumber} 轮（第 ${review.questionStart}-${review.questionEnd} 题）：预设命中 ${review.presetHitCount}/${review.confirmedCount}（${Math.round(review.presetHitRate * 100)}%）。`,
    `整体判断：${review.summary}`,
    review.stableTraits.length ? `已稳定倾向：${review.stableTraits.join('；')}` : '',
    review.contextualTraits.length ? `需要保留情境差异：${review.contextualTraits.join('；')}` : '',
    review.possibleContradictions.length ? `下一轮优先澄清：${review.possibleContradictions.join('；')}` : '',
    '下一轮仍须九维各 2 题打底；多出的 2 个探针优先用于薄弱维度、情境差异或待澄清矛盾。不要回改已完成轮次的题面或预设答案。'
  ].filter(Boolean)
  return {
    ...snapshot,
    targetTrainingGroupCount: input.dataset.questionGroups?.length || 0,
    targetEvaluationQuestionCount: 0,
    adaptiveCalibrationReviews: nextReviews,
    adaptiveCalibrationContext: contextLines.join('\n'),
    lastGenerationFailure: null
  }
}

/**
 * 一次设问派遣可追加任意正整数题量；20 只保留为推荐的校准观察窗和缺省批量。
 * 复盘若执行，仍经 buildCompletedPersonalityCalibrationReviewPromptSnapshot 单独持久化，
 * 不成为继续生成的硬门槛。底层每 10 题 checkpoint，末尾不足 10 题也会作为最后一批交卷。
 */
export function buildPersonalityQuestionBatchPromptSnapshot(input: {
  dataset: PersonalityTrainingDataset
  questionCount: number
}): Record<string, unknown> {
  const snapshot = { ...((input.dataset.promptSnapshot || {}) as Record<string, unknown>) }
  const questionCount = Math.trunc(Number(input.questionCount) || 0)
  if (!Number.isSafeInteger(questionCount) || questionCount <= 0) {
    throw new Error('追加题量必须是正整数')
  }
  return {
    ...snapshot,
    targetTrainingGroupCount: (input.dataset.questionGroups?.length || 0) + questionCount,
    targetEvaluationQuestionCount: 0,
    lastGenerationFailure: null
  }
}

/** 从数据集派生性格校准样本：只使用人工确认答案；反例＝同组其余候选。
 *  一处真值两入口：训练弹窗 calibrationSamples computed 与星依 calibratePersonality 工具都走这里。 */
export function buildCalibrationSamplesFromDataset(input: {
  dimensionPlan?: unknown[] | null
  questionGroups?: PersonalityQuestionGroup[] | null
  answers?: PersonalityAnswerMap | null
}): PersonalityCalibrationSample[] {
  const plan = input.dimensionPlan || []
  const groups = input.questionGroups || []
  const answers = input.answers || {}
  const out: PersonalityCalibrationSample[] = []
  groups.forEach((group, index) => {
    const entry = normalizeAnswerEntry(answers[group.id])
    if (!isConfirmedAnswer(entry)) return
    const candidateId = String(entry?.candidateId || '').trim()
    const candidates = group.candidates || []
    if (candidates.length < 2) return
    const chosen = candidates.find((item) => item.id === candidateId)
    const chosenPlan = String(chosen?.text || '').trim()
    if (!chosenPlan) return
    out.push({
      id: group.id,
      dimension: resolvePersonalityQuestionDimension(group.dimension, plan, index + 1, 'training') || '未分维度',
      situation: String(group.question || ''),
      chosenPlan,
      rejectedPlans: candidates
        .filter((item) => item.id !== candidateId)
        .map((item) => String(item.text || '').trim())
        .filter(Boolean)
    })
  })
  return out
}

export function readQuestionnaireGenerationCheckpoint(
  promptSnapshot: Record<string, unknown> | null | undefined
): PersonalityQuestionnaireGenerationCheckpoint | null {
  const value = promptSnapshot?.questionnaireGenerationCheckpoint
  if (!value || typeof value !== 'object') return null
  const checkpoint = value as Record<string, unknown>
  if (checkpoint.status !== 'in_progress' || Number(checkpoint.schemaVersion) !== 1) return null
  const stage = String(checkpoint.stage || '')
  if (!['dimension_plan', 'training_batch', 'evaluation_batch'].includes(stage)) return null
  return {
    schemaVersion: 1,
    status: 'in_progress',
    stage: stage as PersonalityQuestionnaireGenerationProgress['stage'],
    targetTrainingGroupCount: clampCount(checkpoint.targetTrainingGroupCount, PERSONALITY_CALIBRATION_ROUND_SIZE),
    targetEvaluationQuestionCount: clampCount(checkpoint.targetEvaluationQuestionCount, 0, true),
    completedTrainingCount: Math.max(0, Math.trunc(Number(checkpoint.completedTrainingCount) || 0)),
    completedEvaluationCount: Math.max(0, Math.trunc(Number(checkpoint.completedEvaluationCount) || 0)),
    evaluationQuestions: Array.isArray(checkpoint.evaluationQuestions)
      ? checkpoint.evaluationQuestions as PersonalityQuestionGroup[]
      : [],
    pendingTrainingBatches: Array.isArray(checkpoint.pendingTrainingBatches)
      ? checkpoint.pendingTrainingBatches.filter(Array.isArray) as PersonalityQuestionGroup[][]
      : [],
    pendingEvaluationBatches: Array.isArray(checkpoint.pendingEvaluationBatches)
      ? checkpoint.pendingEvaluationBatches.filter(Array.isArray) as PersonalityQuestionGroup[][]
      : [],
    savedAt: String(checkpoint.savedAt || '')
  }
}

export function buildQuestionnaireResumeDraft(
  dataset: PersonalityTrainingDataset | null | undefined
): PersonalityQuestionnaireDraft | null {
  const checkpoint = readQuestionnaireGenerationCheckpoint(dataset?.promptSnapshot)
  if (!dataset || !checkpoint) return null
  return {
    dimensionPlan: Array.isArray(dataset.dimensionPlan) ? dataset.dimensionPlan : [],
    questionGroups: Array.isArray(dataset.questionGroups) ? dataset.questionGroups : [],
    evaluationQuestions: checkpoint.evaluationQuestions,
    pendingTrainingBatches: checkpoint.pendingTrainingBatches,
    pendingEvaluationBatches: checkpoint.pendingEvaluationBatches
  }
}

export function buildQuestionnaireCheckpointPromptSnapshot(
  dataset: PersonalityTrainingDataset,
  checkpoint: PersonalityQuestionnaireGenerationCheckpoint
): Record<string, unknown> {
  return {
    ...((dataset.promptSnapshot || {}) as Record<string, unknown>),
    questionnaireGenerationCheckpoint: checkpoint,
    lastGenerationFailure: null
  }
}

export function buildQuestionnaireSuccessPromptSnapshot(
  dataset: PersonalityTrainingDataset,
  draft: PersonalityQuestionnaireDraft
): Record<string, unknown> {
  const snapshot = { ...((dataset.promptSnapshot || {}) as Record<string, unknown>) }
  delete snapshot.questionnaireGenerationCheckpoint
  return {
    ...snapshot,
    lastGenerationFailure: null,
    lastGenerationSuccess: {
      generatedAt: new Date().toISOString(),
      questionGroupCount: draft.questionGroups.length,
      evaluationQuestionCount: draft.evaluationQuestions.length
    }
  }
}

/** 出题失败时从错误对象读结构化诊断（QuestionnaireParseError 才带；一处真值两入口：弹窗+星依工具）。 */
export function readQuestionnaireGenerationDiagnostic(error: unknown): PersonalityQuestionnaireGenerationDiagnostic | null {
  const diagnostic = (error as { diagnostic?: PersonalityQuestionnaireGenerationDiagnostic } | null)?.diagnostic
  return diagnostic && typeof diagnostic === 'object' ? diagnostic : null
}

/** 出题失败诊断落进 promptSnapshot（供数据集列表展示失败原因；一处真值两入口：弹窗+星依工具）。 */
export function buildQuestionnaireFailurePromptSnapshot(
  dataset: PersonalityTrainingDataset,
  error: unknown,
  fallbackStage = 'unknown'
): Record<string, unknown> {
  const diagnostic = readQuestionnaireGenerationDiagnostic(error)
  return {
    ...((dataset.promptSnapshot || {}) as Record<string, unknown>),
    lastGenerationFailure: {
      failedAt: new Date().toISOString(),
      stage: diagnostic?.stage || fallbackStage,
      message: error instanceof Error ? error.message : String(error),
      diagnostic: diagnostic || null
    }
  }
}

export function formatPercentMetric(value: unknown): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  // 台账保留原始小数，UI 统一整数百分比口径
  const ratio = num > 1 ? num : num * 100
  return `${Math.round(ratio)}%`
}

export function formatVersionTime(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return '—'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const PERSONALITY_VERSION_STATUS_LABELS: Record<string, string> = {
  installed: '当前安装',
  ready: '已保存',
  trained: '已训练',
  evaluated: '已评测',
  draft: '草稿',
  failed: '失败',
  archived: '已归档'
}

export const PERSONALITY_VERSION_SOURCE_LABELS: Record<string, string> = {
  manual_upload: '手动上传',
  questionnaire: '问卷训练',
  chat_projection_selection: '聊天投影优化',
  manual_import: '数据导入'
}

export const PERSONALITY_TRAINING_BACKEND_LABELS: Record<string, string> = {
  manual_upload: '手动上传',
  local: '本机训练',
  colab_notebook: 'Colab 导入',
  vertex_custom_training: 'Vertex 训练'
}

// 失败阶段真值与服务端 localTrainingService 联动：预检 / 数据导出 / 训练 / 导出 ONNX / 导入校验
export const PERSONALITY_FAILURE_STAGE_LABELS: Record<string, string> = {
  precheck: '预检',
  data_export: '数据导出',
  train: '训练',
  export_onnx: '导出 ONNX',
  import_validation: '导入校验',
  interrupted: '服务中断',
  cancelled: '已取消'
}

// 训练任务五阶段（UI 竖向进度），与 metrics.progressStage 对应
export const PERSONALITY_TRAINING_STAGES: Array<{ id: string; label: string; desc: string }> = [
  { id: 'precheck', label: '预检与环境准备', desc: 'Python / 依赖 / 磁盘' },
  { id: 'data_export', label: '导出训练数据包', desc: '合并数据集 · 按组切分' },
  { id: 'train', label: '训练', desc: '公开基底合并重训' },
  { id: 'export_onnx', label: '导出 ONNX 包', desc: 'q8 量化 · 浏览器可加载' },
  { id: 'import_validation', label: '导入校验', desc: '包结构校验 · 写入版本台账' }
]

export const ACTIVE_TRAINING_RUN_STATUSES = ['pending', 'preparing', 'running', 'importing']

export function isActiveTrainingRun(run: PersonalityTrainingRun | null | undefined) {
  return Boolean(run && ACTIVE_TRAINING_RUN_STATUSES.includes(String(run.status || '')))
}
