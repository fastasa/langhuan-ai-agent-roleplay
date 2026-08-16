import type { PersonalityQuestionPressureLevel } from '../../shared/personalityQuestionnaireDesign'
import type { PersonalityQuestionGroup } from './personalityTrainingWorkflow'

export type PersonalityQuestionHistoryScope = 'training' | 'evaluation'
export const READ_FULL_PERSONALITY_QUESTION_HISTORY_TOOL = 'readFullPersonalityQuestionHistory'

export interface PersonalityQuestionHistoryEntry {
  scope: PersonalityQuestionHistoryScope
  resourceId: string
  questionNumber: number
  questionId: string
  question: string
  dimension: string
  difficulty: string
  scenarioType: string
  pressureLevel: PersonalityQuestionPressureLevel | ''
  diversityNote: string
  candidates: Array<{ id: string; text: string }>
  presetAnswerId: string
}

export interface PersonalityQuestionHistorySnapshot {
  trainingResourceId: string
  evaluationResourceId: string
  entries: PersonalityQuestionHistoryEntry[]
  /** 只供运行时判断“全量读取后题库是否变化”，不进入模型正文。 */
  signature: string
  fingerprint: string
}

function normalizeCollection(input: {
  scope: PersonalityQuestionHistoryScope
  resourceId?: string
  questions?: PersonalityQuestionGroup[]
}): PersonalityQuestionHistoryEntry[] {
  const resourceId = String(input.resourceId || '').trim()
  return (input.questions || []).map((question, index) => ({
    scope: input.scope,
    resourceId,
    questionNumber: index + 1,
    questionId: String(question.id || '').trim(),
    question: String(question.question || '').trim(),
    dimension: String(question.dimension || '').trim(),
    difficulty: String(question.difficulty || '').trim(),
    scenarioType: String(question.scenarioType || '').trim(),
    pressureLevel: question.pressureLevel || '',
    diversityNote: String(question.diversityNote || '').trim(),
    candidates: (question.candidates || []).map((candidate) => ({
      id: String(candidate.id || '').trim(),
      text: String(candidate.text || '').trim()
    })),
    presetAnswerId: String(question.presetAnswerId || '').trim()
  }))
}

function hashSignature(signature: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `qhist_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function buildPersonalityQuestionHistorySnapshot(input: {
  training?: { resourceId?: string; questions?: PersonalityQuestionGroup[] } | null
  evaluation?: { resourceId?: string; questions?: PersonalityQuestionGroup[] } | null
}): PersonalityQuestionHistorySnapshot {
  const trainingResourceId = String(input.training?.resourceId || '').trim()
  const evaluationResourceId = String(input.evaluation?.resourceId || '').trim()
  const entries = [
    ...normalizeCollection({
      scope: 'training',
      resourceId: trainingResourceId,
      questions: input.training?.questions
    }),
    ...normalizeCollection({
      scope: 'evaluation',
      resourceId: evaluationResourceId,
      questions: input.evaluation?.questions
    })
  ]
  const signature = JSON.stringify({
    trainingResourceId,
    evaluationResourceId,
    entries
  })
  return {
    trainingResourceId,
    evaluationResourceId,
    entries,
    signature,
    fingerprint: hashSignature(signature)
  }
}

export function renderPersonalityQuestionHistory(snapshot: PersonalityQuestionHistorySnapshot) {
  if (!snapshot.entries.length) {
    return [
      '已全量读取历史题库：当前没有既有训练题或冻结评测题。',
      `historyFingerprint=${snapshot.fingerprint}`
    ].join('\n')
  }
  const rows = snapshot.entries.map((entry) => (
    `${entry.scope === 'training' ? '训练题' : '评测题'} #${entry.questionNumber} ${entry.questionId}｜维度=${entry.dimension || '未标注'}｜情境类型=${entry.scenarioType || '旧题未标注'}｜压力程度=${entry.pressureLevel || '旧题未标注'}｜情境=${entry.question}`
  ))
  const trainingCount = snapshot.entries.filter((entry) => entry.scope === 'training').length
  const evaluationCount = snapshot.entries.length - trainingCount
  return [
    `已全量读取历史题库：训练题 ${trainingCount}，冻结评测题 ${evaluationCount}，合计 ${snapshot.entries.length}。`,
    `historyFingerprint=${snapshot.fingerprint}`,
    '以下完整题干全部属于查重真值；候选与答案不参与“情境是否重复”的判断，已从模型输入中省略。新题或改写题必须在情境类型、压力程度或二者组合上形成可说明的差异，不能只换人名、地点或措辞。',
    '',
    ...rows
  ].join('\n')
}
