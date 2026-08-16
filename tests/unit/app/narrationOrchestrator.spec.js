import { describe, expect, it } from 'vitest'

import {
  buildLocalSemanticSignal,
  buildNarrationRoundText,
  calculateNarrationTextSimilarity,
  normalizeNarrationAgentRouteConfig,
  planNarration
} from '../../../src/app/narrationOrchestrator'

describe('narrationOrchestrator', () => {
  it('hard time, weather, or location changes always trigger environment narration', () => {
    const plan = planNarration({
      session: { narrationFrequency: 'silent', narrationTemperature: 'documentary' },
      ruleSignals: {
        timeJumpMinutes: 180,
        roundsSinceLastNarration: 0
      },
      randomSignal: { environmentRoll: 1, eventPushRoll: 1 }
    })

    expect(plan).toEqual(expect.objectContaining({
      shouldInsert: true,
      narrationKind: 'environment',
      frequency: 'silent',
      temperature: 'documentary'
    }))
    expect(plan.reasons).toContain('hard_time_shift')
  })

  it('manual trigger requests event push and bypasses interval limits', () => {
    const plan = planNarration({
      session: { narrationFrequency: 'silent', narrationTemperature: 'open' },
      ruleSignals: {
        manualTrigger: true,
        roundsSinceLastNarration: 0
      }
    })

    expect(plan.shouldInsert).toBe(true)
    expect(plan.narrationKind).toBe('event_push')
    expect(plan.modelTier).toBe('strong')
    expect(plan.reasons).toEqual(['manual_trigger'])
  })

  it('skips automatic narration when the interval gate blocks soft signals', () => {
    const plan = planNarration({
      session: { narrationFrequency: 'standard', narrationTemperature: 'standard' },
      ruleSignals: { roundsSinceLastNarration: 0 },
      semanticSignal: { maxSimilarity: 0.99, averageSimilarity: 0.9, source: 'embedding' },
      quickJudge: { tags: ['stagnation'], confidence: 1 },
      randomSignal: { environmentRoll: 0, eventPushRoll: 0 }
    })

    expect(plan.shouldInsert).toBe(false)
    expect(plan.skipReason).toBe('recent_narration_interval')
  })

  it('keeps hard scene changes above the recent narration interval gate', () => {
    const plan = planNarration({
      session: { narrationFrequency: 'silent', narrationTemperature: 'standard' },
      ruleSignals: {
        weatherChanged: true,
        roundsSinceLastNarration: 0
      },
      semanticSignal: { maxSimilarity: 0.99, averageSimilarity: 0.95, source: 'embedding' },
      quickJudge: { tags: ['stagnation'], confidence: 1 },
      randomSignal: { environmentRoll: 1, eventPushRoll: 1 }
    })

    expect(plan.shouldInsert).toBe(true)
    expect(plan.narrationKind).toBe('environment')
    expect(plan.skipReason).toBeUndefined()
    expect(plan.reasons).toContain('hard_weather_shift')
  })

  it('high semantic similarity and quick judge stagnation raise event push score', () => {
    const plan = planNarration({
      session: { narrationFrequency: 'standard', narrationTemperature: 'standard' },
      ruleSignals: { roundsSinceLastNarration: 2 },
      semanticSignal: { maxSimilarity: 0.88, averageSimilarity: 0.8, source: 'embedding' },
      quickJudge: { tags: ['stagnation', 'low_information'], confidence: 0.9 },
      randomSignal: { environmentRoll: 1, eventPushRoll: 1 }
    })

    expect(plan.shouldInsert).toBe(true)
    expect(plan.narrationKind).toBe('event_push')
    expect(plan.reasons).toContain('semantic_stagnation')
    expect(plan.score).toBeGreaterThanOrEqual(0.64)
  })

  it('random surprise can trigger environment or event push within configured probabilities', () => {
    const eventPlan = planNarration({
      session: { narrationFrequency: 'standard', narrationTemperature: 'standard' },
      ruleSignals: { roundsSinceLastNarration: 2 },
      randomSignal: { eventPushRoll: 0.05, environmentRoll: 1 }
    })
    const environmentPlan = planNarration({
      session: { narrationFrequency: 'standard', narrationTemperature: 'standard' },
      ruleSignals: { roundsSinceLastNarration: 2 },
      randomSignal: { eventPushRoll: 1, environmentRoll: 0.05 }
    })

    expect(eventPlan.narrationKind).toBe('event_push')
    expect(eventPlan.reasons).toContain('random_event_push')
    expect(environmentPlan.narrationKind).toBe('environment')
    expect(environmentPlan.reasons).toContain('random_environment')
  })

  it('uses local text similarity as a deterministic semantic fallback', () => {
    const current = '用户：今天好无聊。角色：嗯，是有点安静。'
    const recent = '用户：今天好无聊。角色：嗯，是有点安静。'

    expect(calculateNarrationTextSimilarity(current, recent)).toBeGreaterThan(0.9)
    expect(buildLocalSemanticSignal(current, [recent])).toEqual(expect.objectContaining({
      maxSimilarity: expect.any(Number),
      source: 'local_text'
    }))
  })

  it('reads narration agent routes from the brain agent config with fallbacks', () => {
    expect(normalizeNarrationAgentRouteConfig({
      presetName: 'Default',
      recallModel: 'fast',
      embeddingPresetId: 'embedding_default',
      narrationQuickJudgePresetName: 'Quick',
      narrativeBeatModel: 'beat',
      narrationGenerationPresetName: 'Final'
    })).toEqual({
      quickJudgePresetName: 'Quick',
      quickJudgeModel: 'fast',
      narrativeBeatPresetName: 'Quick',
      narrativeBeatModel: 'beat',
      narrationGenerationPresetName: 'Final',
      narrationGenerationModel: 'beat'
      // narrationEmbeddingPresetId 已退役（批次3·2026-07-08 实查全仓无下游消费·嵌入统一走 embeddingPresetId）。
    })
  })

  it('builds round text with narration as a separate speaker', () => {
    expect(buildNarrationRoundText([
      { role: 'user', name: '奈布伦', content: '看向窗外', envDate: '2026-05-10' },
      { role: 'assistant', messageKind: 'narration', content: '雨声贴着玻璃滑下。' }
    ])).toContain('旁白：雨声贴着玻璃滑下。')
  })

  it('excludes narration debug audit messages from round text', () => {
    const text = buildNarrationRoundText([
      { role: 'user', name: '奈布伦', content: '前往河谷' },
      { role: 'assistant', messageKind: 'narration_debug', content: '是' },
      { role: 'assistant', messageKind: 'narration', content: '河谷的风漫过石岸。' }
    ])

    expect(text).toContain('奈布伦：前往河谷')
    expect(text).toContain('旁白：河谷的风漫过石岸。')
    expect(text).not.toContain('是')
  })

  it('builds round text with real speaker names and clean assistant body', () => {
    const text = buildNarrationRoundText([
      { role: 'user', name: '奈布伦', content: '要去哪里投宿？' },
      { role: 'assistant', memberName: '惊雨', content: '<think>内部思考</think>\n惊雨：惊雨：可以先去铜叶子旅店。' }
    ])

    expect(text).toContain('奈布伦：要去哪里投宿？')
    expect(text).toContain('惊雨：可以先去铜叶子旅店。')
    expect(text).not.toContain('<think>')
    expect(text).not.toContain('惊雨：惊雨：')
  })

  it('prefers projection fact over raw content when a message has projection (projection-first)', () => {
    const map = new Map([[42, '惊雨向奈布伦提出先去铜叶子旅店投宿。']])
    const text = buildNarrationRoundText([
      { id: 41, role: 'user', name: '奈布伦', content: '要去哪里投宿？' },
      { id: 42, role: 'assistant', memberName: '惊雨', content: '$惊雨抬手指向远处$（神情笃定）{心里盘算着钱够不够}“可以先去铜叶子旅店。”' }
    ], map)

    // 命中投影的角色消息用客观事实，剥掉 $动作$/（神态）/{心理}/台词杂质
    expect(text).toContain('惊雨：惊雨向奈布伦提出先去铜叶子旅店投宿。')
    expect(text).not.toContain('$惊雨抬手指向远处$')
    expect(text).not.toContain('{心里盘算')
    // 未命中投影的用户消息按文档允许局部兜底原文
    expect(text).toContain('奈布伦：要去哪里投宿？')
  })

  it('falls back to raw content when no projection lookup provided (backward compatible)', () => {
    const text = buildNarrationRoundText([
      { id: 7, role: 'assistant', memberName: '惊雨', content: '惊雨低声说了句什么。' }
    ])
    expect(text).toContain('惊雨：惊雨低声说了句什么。')
  })

  it('accepts a plain record lookup as well as a Map', () => {
    const text = buildNarrationRoundText([
      { id: 9, role: 'assistant', memberName: '惊雨', content: '$原文杂质$' }
    ], { 9: '惊雨沉默片刻。' })
    expect(text).toContain('惊雨：惊雨沉默片刻。')
    expect(text).not.toContain('$原文杂质$')
  })
})
