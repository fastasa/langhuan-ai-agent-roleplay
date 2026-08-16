import { beforeEach, describe, expect, it, vi } from 'vitest'

const rerankerMocks = vi.hoisted(() => ({
  scorePersonalityPlans: vi.fn()
}))

vi.mock('../../../src/app/personalityRerankerBrowser.ts', () => ({
  scorePersonalityPlans: rerankerMocks.scorePersonalityPlans
}))

import {
  calculatePersonalityEvaluationPauseMs,
  runPersonalityEvaluation
} from '../../../src/app/personalityTrainingWorkflow.ts'

function question(id, presetAnswerId) {
  return {
    id,
    question: `情境 ${id}`,
    dimension: '冻结维度',
    difficulty: 'standard',
    candidates: ['A', 'B', 'C'].map((label) => ({
      id: `${id}-${label}`,
      label,
      text: `${id} 选项 ${label}`
    })),
    presetAnswerId: `${id}-${presetAnswerId}`
  }
}

describe('personality evaluation', () => {
  beforeEach(() => {
    rerankerMocks.scorePersonalityPlans.mockReset()
  })

  it('按性能预算把逐题推理与机器喘息时间分开', () => {
    expect(calculatePersonalityEvaluationPauseMs(1000, 0.5)).toBe(1000)
    expect(calculatePersonalityEvaluationPauseMs(1000, 0.25)).toBe(3000)
    expect(calculatePersonalityEvaluationPauseMs(10, 0.5)).toBe(80)
    expect(calculatePersonalityEvaluationPauseMs(1000, 1)).toBe(0)
  })

  it('逐题返回标准答案、模型实际答案与命中状态', async () => {
    rerankerMocks.scorePersonalityPlans
      .mockResolvedValueOnce([0.1, 0.9, 0.2])
      .mockResolvedValueOnce([0.8, 0.5, 0.1])
    const onQuestionResult = vi.fn()

    const result = await runPersonalityEvaluation({
      modelPath: 'personality-models/char-1/version-1',
      questions: [question('q1', 'B'), question('q2', 'B')],
      answers: {
        q2: { candidateId: 'q2-C', reviewState: 'confirmed' }
      },
      performanceBudgetRatio: 1,
      onQuestionResult
    })

    expect(result.evaluatedGroups).toBe(2)
    expect(result.top1Hits).toBe(1)
    expect(result.top1Accuracy).toBe(0.5)
    expect(result.mrr).toBeCloseTo(2 / 3)
    expect(result.questionResults[0]).toMatchObject({
      questionId: 'q1',
      expectedSource: 'preset',
      expectedAnswer: { candidateId: 'q1-B', label: 'B', text: 'q1 选项 B' },
      modelAnswer: { candidateId: 'q1-B', label: 'B', text: 'q1 选项 B', score: 0.9 },
      hit: true
    })
    expect(result.questionResults[1]).toMatchObject({
      questionId: 'q2',
      expectedSource: 'confirmed',
      expectedAnswer: { candidateId: 'q2-C', label: 'C', text: 'q2 选项 C' },
      modelAnswer: { candidateId: 'q2-A', label: 'A', text: 'q2 选项 A', score: 0.8 },
      hit: false
    })
    expect(onQuestionResult).toHaveBeenCalledTimes(2)
  })
})
