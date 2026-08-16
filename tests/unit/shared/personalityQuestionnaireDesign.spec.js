import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS,
  buildDefaultPersonalityQuestionnaireDimensionPlan,
  renderPersonalityQuestionnaireBatchProtocol,
  renderPersonalityQuestionnaireDesignProtocol,
  resolvePersonalityQuestionComplexity,
  resolvePersonalityQuestionPressureLevel
} from '../../../shared/personalityQuestionnaireDesign.ts'

describe('personality questionnaire design protocol', () => {
  it('uses nine concrete behavior domains with ten unique low-burden seeds each', () => {
    expect(DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS).toHaveLength(9)
    for (const dimension of DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS) {
      expect(dimension.scenarioSeeds).toHaveLength(10)
      expect(new Set(dimension.scenarioSeeds).size).toBe(10)
    }
    expect(DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS[0].name).toContain('社交主动')
    expect(DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS.at(-1).name).toContain('成人亲密信任')
  })

  it('keeps 90 questions balanced while the runtime places dimensions in round-robin order', () => {
    const plan = buildDefaultPersonalityQuestionnaireDimensionPlan(90, 24)
    expect(plan.map((item) => item.targetTrainingCount)).toEqual(Array(9).fill(10))
    expect(plan.reduce((sum, item) => sum + item.targetEvaluationCount, 0)).toBe(24)
    expect(Array.from({ length: 90 }, (_, index) => resolvePersonalityQuestionComplexity(index + 1))
      .filter((complexity) => complexity === 'simple')).toHaveLength(81)
    expect(renderPersonalityQuestionnaireDesignProtocol()).toContain('每窗九维各 2 题打底')
    expect(renderPersonalityQuestionnaireDesignProtocol()).toContain('不预设总题数上限')
    expect(renderPersonalityQuestionnaireDesignProtocol()).toContain('继续、暂停或进入训练始终由用户决定')
  })

  it('keeps high-frequency batch prompts on the shared core without repeating all ninety seeds', () => {
    const protocol = renderPersonalityQuestionnaireBatchProtocol()
    expect(protocol).toContain('【人格问卷情境设计协议 v8】')
    expect(protocol).toContain('一次设问派遣可以跨越一个或多个观察窗')
    expect(protocol).toContain('性骚扰、性胁迫')
    expect(protocol).toContain('未成年人遭遇诱导、胁迫或性侵害')
    expect(protocol).toContain('不预写后果、创伤反应、保护方案、法律定性、道德评语')
    expect(protocol).toContain('每连续 10 题固定 9 道简单题')
    expect(protocol).toContain('题干用一到两句短句且不超过 80 个字符')
    expect(protocol).toContain('每个候选不超过 60 个字符')
    expect(protocol).toContain('不要只写 A/B 再让某个候选选择不存在的 C')
    expect(protocol).toContain('presetAnswerId')
    expect(protocol).toContain('全量读取现有训练题和冻结评测题')
    expect(protocol).toContain('scenarioType')
    expect(protocol).toContain('pressureLevel')
    expect(protocol).toContain('diversityNote')
    expect(protocol).not.toContain('10 个情境种子：')
    expect(protocol).not.toContain(DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS[0].scenarioSeeds[0])
  })

  it('rotates pressure levels independently from simple/complex layout', () => {
    const pressures = Array.from({ length: 10 }, (_, index) => (
      resolvePersonalityQuestionPressureLevel(index + 1)
    ))
    expect(new Set(pressures)).toEqual(new Set(['low', 'medium', 'high']))
    expect(resolvePersonalityQuestionComplexity(4)).toBe('simple')
    expect(resolvePersonalityQuestionPressureLevel(4)).toBe('high')
  })
})
