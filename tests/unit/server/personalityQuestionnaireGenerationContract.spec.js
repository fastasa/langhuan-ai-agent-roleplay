import { describe, expect, it, vi } from 'vitest'
import {
  buildPersonalityChatSamplePrompt,
  buildPersonalityQuestionnairePrompt
} from '../../../server/application/personalityTraining/personalityQuestionnairePrompt.ts'
import { createPersonalityTrainingAppService } from '../../../server/application/personalityTraining/personalityTrainingAppService.ts'

function generatedQuestion(id = 'q001') {
  return {
    id,
    question: '补给即将耗尽时收到撤离许可，随后发现许可只允许一人离开。',
    dimension: '压力反应',
    difficulty: 'extreme',
    scenarioType: '单人撤离资格',
    pressureLevel: 'high',
    diversityNote: '相对旧题改为稀缺撤离资格冲突',
    candidates: [
      { id: 'A', text: '心里慌乱，表面立刻独自离开。', label: 'A' },
      { id: 'B', text: '心里清楚代价，表面要求重谈撤离条件。', label: 'B' },
      { id: 'C', text: '心里绝望，表面拒绝再做决定。', label: 'C' }
    ],
    presetAnswerId: 'B'
  }
}

function createServiceHarness(datasetOverrides = {}) {
  const dataset = {
    datasetId: 'ds-1',
    characterId: 'char-1',
    promptSnapshot: {},
    sourceSummary: {},
    dimensionPlan: [],
    questionGroups: [],
    answers: {},
    ...datasetOverrides
  }
  const repository = {
    getDataset: vi.fn(() => dataset),
    updateDatasetQuestionnaire: vi.fn((input) => ({ ...dataset, ...input })),
    updateDatasetAnswers: vi.fn((input) => ({ ...dataset, ...input })),
    retireActiveEvaluationSets: vi.fn(),
    createEvaluationSet: vi.fn()
  }
  const characters = { getCharacterById: vi.fn(() => ({ id: 'char-1', name: '星依' })) }
  return {
    service: createPersonalityTrainingAppService(repository, characters),
    repository
  }
}

describe('personality questionnaire generation contract', () => {
  it('new questionnaire starts with one 20-question calibration round and delays frozen evaluation', () => {
    const prompt = buildPersonalityQuestionnairePrompt({ character: { name: '星依' } })
    expect(prompt.version).toBe(8)
    expect(prompt.targetTrainingGroupCount).toBe(20)
    expect(prompt.targetEvaluationQuestionCount).toBe(0)
    expect(prompt.finalPrompt).toContain('最终目标：用低认知负担、可快速直觉作答的简单情境')
    expect(prompt.finalPrompt).toContain('九维各 2 题')
    expect(prompt.finalPrompt).toContain('冻结评测题等用户确认人格稳定后')
    expect(prompt.finalPrompt).toContain('每连续 10 题固定 9 道简单题')
    expect(prompt.finalPrompt).toContain('禁止只给 A/B 再让候选补造 C')
    expect(prompt.finalPrompt).toContain('成人亲密信任与身体边界')
    expect(prompt.finalPrompt).toContain('性骚扰、性胁迫')
    expect(prompt.finalPrompt).toContain('未成年人遭遇诱导、胁迫或性侵害')
    expect(prompt.finalPrompt).toContain('不预写后果、创伤反应、保护方案')
    expect(prompt.finalPrompt).toContain('presetAnswerId')
    expect(prompt.finalPrompt).toContain('scenarioType')
    expect(prompt.finalPrompt).toContain('pressureLevel')
    expect(prompt.finalPrompt).toContain('diversityNote')
    expect(prompt.finalPrompt).toContain('全量读取现有训练题和冻结评测题')
    expect(prompt.finalPrompt).toContain('没有人工选择时，合法 presetAnswerId 作为正式默认选择')
  })

  it('keeps chat-projection training questions inside the observed facts', () => {
    const prompt = buildPersonalityChatSamplePrompt({
      character: { name: '星依' },
      projectionItems: [{ fact: '朋友邀请星依参加一个小型聚会。' }]
    })
    expect(prompt.version).toBe(3)
    expect(prompt.finalPrompt).toContain('容易快速回答')
    expect(prompt.finalPrompt).toContain('不得补造原事实里没有的人物、资源、选项、转折或后续事件')
    expect(prompt.finalPrompt).toContain('禁止只给 A/B 再让候选选择不存在的 C')
  })

  it('keeps presetAnswerId and marks partial checkpoints as generating', () => {
    const { service, repository } = createServiceHarness()
    service.saveDatasetQuestionnaire('char-1', 'ds-1', {
      dimensionPlan: [{ id: 'd01', name: '压力反应' }],
      questionGroups: [generatedQuestion()],
      promptSnapshot: {
        questionnaireGenerationCheckpoint: { schemaVersion: 1, status: 'in_progress' }
      }
    })

    expect(repository.updateDatasetQuestionnaire).toHaveBeenCalledWith(expect.objectContaining({
      status: 'questionnaire_generating',
      questionGroups: [expect.objectContaining({
        presetAnswerId: 'B',
        scenarioType: '单人撤离资格',
        pressureLevel: 'high',
        diversityNote: '相对旧题改为稀缺撤离资格冲突'
      })]
    }))
    expect(repository.createEvaluationSet).not.toHaveBeenCalled()
  })

  it('publishes completed evaluation questions and atomically rebuilds the answer split', () => {
    const { service, repository } = createServiceHarness()
    service.saveDatasetQuestionnaire('char-1', 'ds-1', {
      dimensionPlan: [{ id: 'd01', name: '压力反应' }],
      questionGroups: [generatedQuestion()],
      evaluationQuestions: [generatedQuestion('eval001')],
      promptSnapshot: { lastGenerationSuccess: { questionGroupCount: 1 } }
    })

    expect(repository.updateDatasetQuestionnaire).toHaveBeenCalledWith(expect.objectContaining({
      status: 'draft',
      splitManifest: expect.objectContaining({
        confirmedGroupCount: 1,
        userConfirmedGroupCount: 0,
        presetGroupCount: 1,
        unresolvedGroupCount: 0
      })
    }))
    expect(repository.createEvaluationSet).toHaveBeenCalledWith(expect.objectContaining({
      questions: [expect.objectContaining({
        presetAnswerId: 'B',
        scenarioType: '单人撤离资格',
        pressureLevel: 'high',
        diversityNote: '相对旧题改为稀缺撤离资格冲突'
      })]
    }))
    expect(repository.updateDatasetAnswers).not.toHaveBeenCalled()
  })

  it('drops answers whose questions were removed from the saved questionnaire', () => {
    const q1 = generatedQuestion('q001')
    const q2 = generatedQuestion('q002')
    const { service, repository } = createServiceHarness({
      questionGroups: [q1, q2],
      answers: {
        q001: { candidateId: 'B', reviewState: 'confirmed' },
        q002: { candidateId: 'A', reviewState: 'confirmed' }
      }
    })

    service.saveDatasetQuestionnaire('char-1', 'ds-1', {
      dimensionPlan: [{ id: 'd01', name: '压力反应' }],
      questionGroups: [q1],
      promptSnapshot: {}
    })

    expect(repository.updateDatasetQuestionnaire).toHaveBeenCalledWith(expect.objectContaining({
      answers: { q001: { candidateId: 'B', reviewState: 'confirmed' } },
      splitManifest: expect.objectContaining({
        userConfirmedGroupCount: 1,
        confirmedGroupCount: 1
      })
    }))
  })

  it('preserves every confirmed answer when resume appends new questions', () => {
    const q1 = generatedQuestion('q001')
    const q2 = generatedQuestion('q002')
    const q3 = generatedQuestion('q003')
    const confirmedAnswers = {
      q001: { candidateId: 'B', reviewState: 'confirmed' },
      q002: { candidateId: 'A', reviewState: 'confirmed' }
    }
    const { service, repository } = createServiceHarness({
      questionGroups: [q1, q2],
      answers: confirmedAnswers
    })

    service.saveDatasetQuestionnaire('char-1', 'ds-1', {
      dimensionPlan: [{ id: 'd01', name: '压力反应' }],
      questionGroups: [q1, q2, q3],
      promptSnapshot: {
        questionnaireGenerationCheckpoint: { schemaVersion: 1, status: 'in_progress' }
      }
    })

    const saved = repository.updateDatasetQuestionnaire.mock.calls[0][0]
    expect(saved.answers).toEqual(confirmedAnswers)
    expect(saved.questionGroups.map((question) => question.id)).toEqual(['q001', 'q002', 'q003'])
    expect(repository.updateDatasetAnswers).not.toHaveBeenCalled()
  })

  it('rejects accidental empty-answer overwrite and only allows explicit questionnaire restart', () => {
    const confirmedAnswers = {
      q001: { candidateId: 'B', reviewState: 'confirmed' }
    }
    const { service, repository } = createServiceHarness({
      questionGroups: [generatedQuestion('q001')],
      answers: confirmedAnswers
    })

    expect(() => service.saveDatasetAnswers('char-1', 'ds-1', { answers: {} }))
      .toThrow('拒绝清空人格问卷人工答案')
    expect(repository.updateDatasetAnswers).not.toHaveBeenCalled()

    service.saveDatasetAnswers('char-1', 'ds-1', {
      answers: {},
      allowClearConfirmed: true,
      clearReason: 'restart_current'
    })
    expect(repository.updateDatasetAnswers).toHaveBeenCalledWith(expect.objectContaining({
      answers: {}
    }))
  })
})
